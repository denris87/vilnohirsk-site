import Foundation

// MARK: - Зручний доступ до значень JSON, розібраного через JSONSerialization.
// API міста повертають то числа, то рядки в одних і тих самих полях,
// тому мапимо вручну, а не через Codable.

enum JV {
    static func str(_ v: Any?) -> String {
        if let s = v as? String { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let n = v as? NSNumber { return n.stringValue }
        return ""
    }
    static func dbl(_ v: Any?) -> Double {
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String { return Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0 }
        return 0
    }
    static func int(_ v: Any?) -> Int {
        if let n = v as? NSNumber { return n.intValue }
        if let s = v as? String { return Int(s.filter { $0.isNumber }) ?? 0 }
        return 0
    }
    static func bool(_ v: Any?, default def: Bool = false) -> Bool {
        if let b = v as? Bool { return b }
        if let n = v as? NSNumber { return n.boolValue }
        if let s = (v as? String)?.lowercased() { return s == "true" || s == "так" || s == "✅" || s == "1" }
        return def
    }
    static func arr(_ v: Any?) -> [Any] { v as? [Any] ?? [] }
    static func dict(_ v: Any?) -> [String: Any] { v as? [String: Any] ?? [:] }
    static func dicts(_ v: Any?) -> [[String: Any]] { (v as? [Any])?.compactMap { $0 as? [String: Any] } ?? [] }
    static func strings(_ v: Any?) -> [String] {
        (v as? [Any])?.map { str($0) }.filter { !$0.isEmpty } ?? []
    }
}

// MARK: - HTTP з невеликим кешем у пам'яті

actor MemoryCache {
    static let shared = MemoryCache()
    private var store: [String: (expires: Date, data: Data)] = [:]

    func get(_ key: String) -> Data? {
        guard let entry = store[key], entry.expires > Date() else { return nil }
        return entry.data
    }
    func put(_ key: String, data: Data, ttl: TimeInterval) {
        store[key] = (Date().addingTimeInterval(ttl), data)
    }
}

enum Api {
    static func data(_ urlString: String, ttlMinutes: Double = 3, timeout: TimeInterval = 12) async throws -> Data {
        if let cached = await MemoryCache.shared.get(urlString) { return cached }
        guard let url = URL(string: urlString) else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        let (data, _) = try await URLSession.shared.data(for: request)
        await MemoryCache.shared.put(urlString, data: data, ttl: ttlMinutes * 60)
        return data
    }

    static func json(_ urlString: String, ttlMinutes: Double = 3) async throws -> Any {
        let raw = try await data(urlString, ttlMinutes: ttlMinutes)
        return try JSONSerialization.jsonObject(with: raw)
    }

    static func text(_ urlString: String, ttlMinutes: Double = 3) async throws -> String {
        let raw = try await data(urlString, ttlMinutes: ttlMinutes)
        return String(data: raw, encoding: .utf8) ?? ""
    }

    // Дані з YAML-файлів самого сайту (?v= — обхід CDN-кешу, як робить сайт)
    static func siteYaml(_ name: String) async throws -> [String: Any] {
        let stamp = Int(Date().timeIntervalSince1970 / 300) // свіжий раз на 5 хв
        let text = try await text("https://vilnohirsk.online/data/\(name).yaml?v=\(stamp)", ttlMinutes: 5)
        return YamlLite.parse(text)
    }
}

// MARK: - Мінімальний парсер YAML
// Підтримує рівно те, що є у data/*.yaml сайту: словники, списки словників,
// списки рядків, коментарі, лапки, порожні списки [].

enum YamlLite {
    private struct Line { let indent: Int; let text: String }

    static func parse(_ source: String) -> [String: Any] {
        let lines = tokenize(source)
        var index = 0
        let value = parseBlock(lines, &index, indent: lines.first?.indent ?? 0)
        return value as? [String: Any] ?? [:]
    }

    private static func tokenize(_ source: String) -> [Line] {
        var result: [Line] = []
        for raw in source.components(separatedBy: .newlines) {
            let stripped = stripComment(raw)
            let trimmed = stripped.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }
            let indent = stripped.prefix(while: { $0 == " " }).count
            result.append(Line(indent: indent, text: trimmed))
        }
        return result
    }

    private static func stripComment(_ line: String) -> String {
        var result = ""
        var quote: Character? = nil
        for ch in line {
            if let q = quote {
                result.append(ch)
                if ch == q { quote = nil }
            } else if ch == "\"" || ch == "'" {
                quote = ch
                result.append(ch)
            } else if ch == "#" {
                break
            } else {
                result.append(ch)
            }
        }
        return result
    }

    private static func parseBlock(_ lines: [Line], _ index: inout Int, indent: Int) -> Any {
        guard index < lines.count else { return [String: Any]() }
        if lines[index].text.hasPrefix("-") {
            return parseList(lines, &index, indent: indent)
        }
        return parseDict(lines, &index, indent: indent)
    }

    private static func parseList(_ lines: [Line], _ index: inout Int, indent: Int) -> [Any] {
        var items: [Any] = []
        while index < lines.count, lines[index].indent == indent, lines[index].text.hasPrefix("-") {
            let content = String(lines[index].text.dropFirst()).trimmingCharacters(in: .whitespaces)
            index += 1
            if content.isEmpty {
                if index < lines.count, lines[index].indent > indent {
                    let childIndent = lines[index].indent
                    items.append(parseBlock(lines, &index, indent: childIndent))
                }
            } else if isKeyLine(content) {
                // Елемент-словник: перший рядок — після дефіса, решта — глибший відступ
                var slice: [Line] = [Line(indent: indent + 2, text: content)]
                while index < lines.count, lines[index].indent > indent, !(lines[index].indent == indent && lines[index].text.hasPrefix("-")) {
                    slice.append(Line(indent: max(lines[index].indent, indent + 2), text: lines[index].text))
                    index += 1
                }
                var sliceIndex = 0
                items.append(parseDict(slice, &sliceIndex, indent: indent + 2))
            } else {
                items.append(scalar(content))
            }
        }
        return items
    }

    private static func parseDict(_ lines: [Line], _ index: inout Int, indent: Int) -> [String: Any] {
        var dict: [String: Any] = [:]
        while index < lines.count, lines[index].indent == indent, !lines[index].text.hasPrefix("-") {
            let text = lines[index].text
            guard let colon = text.firstIndex(of: ":") else { index += 1; continue }
            let key = String(text[..<colon]).trimmingCharacters(in: .whitespaces)
            let rest = String(text[text.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
            index += 1
            if rest.isEmpty {
                if index < lines.count, lines[index].indent > indent {
                    let childIndent = lines[index].indent
                    dict[key] = parseBlock(lines, &index, indent: childIndent)
                } else if index < lines.count, lines[index].indent == indent, lines[index].text.hasPrefix("-") {
                    // YAML дозволяє список на тому ж відступі, що і ключ (так у delays.yaml)
                    dict[key] = parseList(lines, &index, indent: indent)
                } else {
                    dict[key] = ""
                }
            } else {
                dict[key] = scalar(rest)
            }
        }
        return dict
    }

    // Рядок виду `key: ...` (ключ — слово без лапок)
    private static func isKeyLine(_ text: String) -> Bool {
        guard let colon = text.firstIndex(of: ":") else { return false }
        let key = text[..<colon]
        guard !key.isEmpty, key.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" }) else { return false }
        let afterColon = text.index(after: colon)
        return afterColon == text.endIndex || text[afterColon] == " "
    }

    private static func scalar(_ raw: String) -> Any {
        if raw == "[]" { return [Any]() }
        if raw.count >= 2, (raw.hasPrefix("\"") && raw.hasSuffix("\"")) || (raw.hasPrefix("'") && raw.hasSuffix("'")) {
            return String(raw.dropFirst().dropLast())
        }
        switch raw.lowercased() {
        case "true": return true
        case "false": return false
        default: break
        }
        if let intValue = Int(raw) { return intValue }
        if let doubleValue = Double(raw) { return doubleValue }
        return raw
    }
}

// MARK: - Парсер CSV (Google Sheets віддає таблиці форм у CSV)

enum CSVLite {
    static func parse(_ text: String) -> [[String]] {
        var rows: [[String]] = []
        var row: [String] = []
        var field = ""
        var inQuotes = false
        let chars = Array(text)
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if inQuotes {
                if c == "\"" {
                    if i + 1 < chars.count, chars[i + 1] == "\"" {
                        field.append("\"")
                        i += 2
                        continue
                    }
                    inQuotes = false
                } else {
                    field.append(c)
                }
            } else {
                switch c {
                case "\"": inQuotes = true
                case ",": row.append(field); field = ""
                case "\r": break
                case "\n": row.append(field); rows.append(row); row = []; field = ""
                default: field.append(c)
                }
            }
            i += 1
        }
        if !field.isEmpty || !row.isEmpty {
            row.append(field)
            rows.append(row)
        }
        return rows
    }

    // Таблиця з заголовком: пошук колонки за фрагментом назви, з fallback на індекс
    struct Table {
        let headers: [String]
        let rows: [[String]]

        init(_ text: String) {
            let all = CSVLite.parse(text)
            headers = (all.first ?? []).map { $0.lowercased() }
            rows = Array(all.dropFirst())
        }

        func value(_ row: [String], contains names: [String], fallback index: Int? = nil) -> String {
            for name in names {
                if let col = headers.firstIndex(where: { $0.contains(name) }), col < row.count {
                    let v = row[col].trimmingCharacters(in: .whitespacesAndNewlines)
                    if !v.isEmpty { return v }
                }
            }
            if let index, index < row.count {
                return row[index].trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return ""
        }
    }
}
