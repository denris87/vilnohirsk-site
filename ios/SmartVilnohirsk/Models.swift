import Foundation

// Моделі даних міста + функції завантаження.
// Джерела ті самі, що використовує сайт vilnohirsk.online (js/app.js).

// MARK: - Транспорт

struct Train: Identifiable {
    let id = UUID()
    let number: String
    let route: String
    let time: String
    let note: String
    let stops: [(String, String)]

    var hasChanges: Bool {
        let n = note.trimmingCharacters(in: .whitespaces)
        return !n.isEmpty && n != "змін немає..."
    }
}

struct TrainDelay: Identifiable {
    let id = UUID()
    let number: String
    let route: String
    let station: String
    let minutes: Int
}

struct BusRoute: Identifiable {
    let id = UUID()
    let route: String
    let note: String
    let info: String
    let directions: [BusDirection]
}

struct BusDirection: Identifiable {
    let id = UUID()
    let title: String
    let rows: [BusRow]
}

struct BusRow: Identifiable {
    let id = UUID()
    let label: String
    let time: String
    let stops: [(String, String)]
}

struct Ride: Identifiable {
    let id = UUID()
    let isDriver: Bool
    let name: String
    let from: String
    let to: String
    let date: String
    let time: String
    let seats: String
    let price: Int
    let phone: String
    let comment: String
}

// MARK: - Місто

struct FuelPrice: Identifiable {
    let id = UUID()
    let name: String
    let price: String
    let colorHex: String
}

struct FuelBoard {
    let updated: String
    let fuels: [FuelPrice]
}

struct SvitloQueue: Identifiable {
    let id = UUID()
    let queue: String
    let slots: [String]
}

struct SvitloProvider: Identifiable {
    let id = UUID()
    let name: String
    let colorHex: String
    let queues: [SvitloQueue]
}

struct SvitloBoard {
    let updated: String
    let revised: String
    let providers: [SvitloProvider]
    var hasOutages: Bool { providers.contains { $0.queues.contains { !$0.slots.isEmpty } } }
}

struct MapPlace: Identifiable {
    let id = UUID()
    let name: String
    let lat: Double
    let lng: Double
    let address: String
}

struct MapCategory: Identifiable {
    let id: String
    let name: String
    let icon: String
    let colorHex: String
    let places: [MapPlace]
}

struct CityAlert: Identifiable {
    let id = UUID()
    let kind: String // "communal" | "news"
    let title: String
    let text: String
}

struct PhonebookEntry: Identifiable {
    let id = UUID()
    let title: String
    let phones: [String]
}

struct PhonebookCategory: Identifiable {
    let id = UUID()
    let name: String
    let icon: String
    let items: [PhonebookEntry]
}

struct Rates {
    let usdBuy: String
    let usdSell: String
    let eurBuy: String
    let eurSell: String
}

struct Weather {
    let temperature: Int
    let emoji: String
    let wind: Int
}

// MARK: - Оголошення

struct Listing: Identifiable {
    let id = UUID()
    let title: String
    let price: String
    let category: String
    let condition: String
    let location: String
    let description: String
    let phone: String
    let photos: [String]
    let isVip: Bool
}

struct EstateItem: Identifiable {
    let id = UUID()
    let dealType: String
    let propertyType: String
    let rooms: String
    let price: String
    let description: String
    let phone: String
    let photos: [String]
    let isVip: Bool
}

struct Job: Identifiable {
    let id = UUID()
    let title: String
    let salary: String
    let company: String
    let description: String
    let date: String
    let phone: String
    let gender: String
    let employment: String
    let isVip: Bool
}

struct LostItem: Identifiable {
    let id = UUID()
    let title: String
    let type: String // "Знайдено" | "Втрачено"
    let category: String
    let location: String
    let description: String
    let phone: String
    let photos: [String]
    var isFound: Bool { type.lowercased().contains("знайд") }
}

struct Promo: Identifiable {
    let id = UUID()
    let shop: String
    let title: String
    let discount: String
    let validUntil: String
    let description: String
    let phone: String
    let photos: [String]
    let isVip: Bool
}

struct Shop: Identifiable {
    let id = UUID()
    let name: String
    let category: String
    let address: String
    let schedule: String
    let phones: [String]
    let photos: [String]
    let instagram: String
    let contactless: Bool
    let isVip: Bool
}

// MARK: - Спільнота

struct EventPoster: Identifiable {
    let id = UUID()
    let photo: String
    let title: String
}

struct Fundraiser: Identifiable {
    let id = UUID()
    let title: String
    let description: String
    let jarURL: String
    let cardNumber: String
    let collected: Int
    let goal: Int
    var percent: Int { goal > 0 ? min(collected * 100 / goal, 100) : 0 }
}

struct MissingPerson: Identifiable {
    let id = UUID()
    let name: String
    let callsign: String
    let dob: String
    let dateMissing: String
    let photos: [String]
}

// MARK: - Завантаження даних

enum CityData {

    // Погода Open-Meteo (Вільногірськ)
    static func weather() async throws -> Weather {
        let json = JV.dict(try await Api.json(
            "https://api.open-meteo.com/v1/forecast?latitude=48.48&longitude=34.02&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe%2FKyiv",
            ttlMinutes: 30))
        let current = JV.dict(json["current"])
        let code = JV.int(current["weather_code"])
        let emoji: String
        switch code {
        case 0: emoji = "☀️"
        case 1...2: emoji = "⛅"
        case 3: emoji = "☁️"
        case 4...48: emoji = "🌫️"
        case 49...67: emoji = "🌧️"
        case 68...77: emoji = "🌨️"
        default: emoji = "⛈️"
        }
        return Weather(
            temperature: Int(JV.dbl(current["temperature_2m"]).rounded()),
            emoji: emoji,
            wind: Int(JV.dbl(current["wind_speed_10m"]).rounded()))
    }

    // Курс валют: ПриватБанк → Monobank → НБУ (той самий ланцюжок, що на сайті)
    static func rates() async -> Rates? {
        if let pb = try? await Api.json("https://api.privatbank.ua/p24api/pubinfo?exchange&json&coursid=5", ttlMinutes: 30) {
            let list = JV.dicts(pb)
            let usd = list.first { JV.str($0["ccy"]) == "USD" }
            let eur = list.first { JV.str($0["ccy"]) == "EUR" }
            if let usd, let eur {
                return Rates(
                    usdBuy: money(JV.dbl(usd["buy"])), usdSell: money(JV.dbl(usd["sale"])),
                    eurBuy: money(JV.dbl(eur["buy"])), eurSell: money(JV.dbl(eur["sale"])))
            }
        }
        if let mono = try? await Api.json("https://api.monobank.ua/bank/currency", ttlMinutes: 60) {
            let list = JV.dicts(mono)
            let usd = list.first { JV.int($0["currencyCodeA"]) == 840 && JV.int($0["currencyCodeB"]) == 980 }
            let eur = list.first { JV.int($0["currencyCodeA"]) == 978 && JV.int($0["currencyCodeB"]) == 980 }
            if let usd, let eur {
                return Rates(
                    usdBuy: money(JV.dbl(usd["rateBuy"])), usdSell: money(JV.dbl(usd["rateSell"])),
                    eurBuy: money(JV.dbl(eur["rateBuy"])), eurSell: money(JV.dbl(eur["rateSell"])))
            }
        }
        if let nbu = try? await Api.json("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json", ttlMinutes: 60) {
            let list = JV.dicts(nbu)
            let usd = list.first { JV.str($0["cc"]) == "USD" }
            let eur = list.first { JV.str($0["cc"]) == "EUR" }
            if let usd, let eur {
                return Rates(
                    usdBuy: money(JV.dbl(usd["rate"])), usdSell: money(JV.dbl(usd["rate"])),
                    eurBuy: money(JV.dbl(eur["rate"])), eurSell: money(JV.dbl(eur["rate"])))
            }
        }
        return nil
    }

    private static func money(_ v: Double) -> String { String(format: "%.2f", v) }

    static func fuel() async throws -> FuelBoard? {
        let yaml = try await Api.siteYaml("fuel")
        guard JV.bool(yaml["show"], default: true) else { return nil }
        let fuels = JV.dicts(yaml["fuels"]).map {
            FuelPrice(name: JV.str($0["name"]), price: JV.str($0["price"]), colorHex: JV.str($0["color"]))
        }
        return FuelBoard(updated: JV.str(yaml["updated"]), fuels: fuels)
    }

    static func svitlo() async throws -> SvitloBoard? {
        let yaml = try await Api.siteYaml("svitlo")
        guard JV.bool(yaml["show"], default: true) else { return nil }
        let providers = JV.dicts(yaml["providers"]).map { p in
            SvitloProvider(
                name: JV.str(p["name"]),
                colorHex: JV.str(p["color"]),
                queues: JV.dicts(p["queues"]).map { q in
                    SvitloQueue(queue: JV.str(q["queue"]), slots: JV.strings(q["slots"]))
                })
        }
        return SvitloBoard(updated: JV.str(yaml["updated"]), revised: JV.str(yaml["revised"]), providers: providers)
    }

    static func delays() async -> [TrainDelay] {
        guard let yaml = try? await Api.siteYaml("delays"), JV.bool(yaml["show"], default: true) else { return [] }
        return JV.dicts(yaml["delays"]).compactMap { d in
            guard JV.bool(d["show"], default: true) else { return nil }
            return TrainDelay(
                number: JV.str(d["number"]),
                route: JV.str(d["route"]).trimmingCharacters(in: .whitespaces),
                station: JV.str(d["station"]),
                minutes: JV.int(d["delay"]))
        }
    }

    static func mapCategories() async throws -> [MapCategory] {
        let yaml = try await Api.siteYaml("places")
        return JV.dicts(yaml["categories"]).compactMap { c in
            guard JV.bool(c["show"], default: true) else { return nil }
            let places = JV.dicts(c["places"]).compactMap { p -> MapPlace? in
                guard JV.bool(p["show"], default: true) else { return nil }
                let lat = JV.dbl(p["lat"]), lng = JV.dbl(p["lng"])
                guard lat != 0, lng != 0 else { return nil }
                return MapPlace(name: JV.str(p["name"]), lat: lat, lng: lng, address: JV.str(p["address"]))
            }
            guard !places.isEmpty else { return nil }
            return MapCategory(
                id: JV.str(c["id"]),
                name: JV.str(c["name"]),
                icon: JV.str(c["icon"]),
                colorHex: JV.str(c["color"]),
                places: places)
        }
    }

    // Електрички: розклад + повний список зупинок
    static func trains() async throws -> [Train] {
        let json = JV.dict(try await Api.json("https://vilnohirsk-trains-production.up.railway.app/api/trains", ttlMinutes: 10))
        let station = JV.str(json["station"]).isEmpty ? "Вільногірськ" : JV.str(json["station"])
        return JV.dicts(json["trains"]).map { t in
            let stops: [(String, String)] = JV.arr(t["fullSchedule"]).compactMap { row in
                let pair = JV.arr(row)
                guard pair.count >= 2 else { return nil }
                return (JV.str(pair[0]), JV.str(pair[1]))
            }
            var time = JV.str(t["time"])
            if time.isEmpty {
                time = stops.first { $0.0.contains(station) }?.1 ?? "—"
            }
            let number = JV.str(t["number"])
                .replacingOccurrences(of: "new", with: "", options: .caseInsensitive)
                .trimmingCharacters(in: CharacterSet(charactersIn: " -_"))
            return Train(number: number, route: JV.str(t["route"]), time: time, note: JV.str(t["note"]), stops: stops)
        }
    }

    // Потяги далекого сполучення
    static func longTrains() async throws -> [Train] {
        let json = JV.dict(try await Api.json("https://grateful-enthusiasm-production-c1cc.up.railway.app/schedule", ttlMinutes: 30))
        let trains = JV.dicts(json["trains"]).map { t -> Train in
            let stops: [(String, String)] = JV.dicts(t["stops"]).map { (JV.str($0["station"]), JV.str($0["time"])) }
            var notes: [String] = []
            let periodicity = JV.str(t["periodicityText"])
            if !periodicity.isEmpty { notes.append("Періодичність: \(periodicity)") }
            let changes = JV.strings(t["changes"])
            if !changes.isEmpty { notes.append(changes.joined(separator: "\n")) }
            return Train(
                number: JV.str(t["number"]),
                route: JV.str(t["route"]),
                time: JV.str(t["time"]),
                note: notes.joined(separator: "\n"),
                stops: stops)
        }
        return trains.sorted { minutesOf($0.time) < minutesOf($1.time) }
    }

    private static func minutesOf(_ time: String) -> Int {
        let parts = time.components(separatedBy: ":")
        guard parts.count >= 2, let h = Int(parts[0].filter { $0.isNumber }), let m = Int(parts[1].prefix(2)) else { return 99999 }
        return h * 60 + m
    }

    static func buses() async throws -> [BusRoute] {
        let json = JV.dict(try await Api.json("https://vilnohirskbuses-production.up.railway.app/api/buses", ttlMinutes: 30))
        return JV.dicts(json["buses"]).map { b in
            let directions = JV.dicts(b["directions"]).map { dir -> BusDirection in
                let rows: [BusRow] = JV.arr(dir["rows"]).compactMap { rowAny in
                    if let pair = rowAny as? [Any], pair.count >= 2 {
                        return BusRow(label: JV.str(pair[0]), time: JV.str(pair[1]), stops: [])
                    }
                    if let obj = rowAny as? [String: Any] {
                        let stops: [(String, String)] = JV.arr(obj["stops"]).compactMap { s in
                            let pair = JV.arr(s)
                            guard pair.count >= 2 else { return nil }
                            return (JV.str(pair[0]), JV.str(pair[1]))
                        }
                        return BusRow(label: JV.str(obj["label"]), time: JV.str(obj["time"]), stops: stops)
                    }
                    return nil
                }
                return BusDirection(title: JV.str(dir["title"]), rows: rows)
            }
            return BusRoute(route: JV.str(b["route"]), note: JV.str(b["note"]), info: JV.str(b["info"]), directions: directions)
        }
    }

    static func rides() async throws -> [Ride] {
        let json = try await Api.json("https://vilnohirsk-blablacar-api-production-67d3.up.railway.app/api/rides", ttlMinutes: 2)
        let list = (json as? [Any]).map { JV.dicts($0) } ?? JV.dicts(JV.dict(json)["rides"])
        return list.map { r in
            Ride(
                isDriver: JV.str(r["type"]) == "driver",
                name: JV.str(r["name"]),
                from: JV.str(r["from"]),
                to: JV.str(r["to"]),
                date: JV.str(r["date"]),
                time: JV.str(r["time"]),
                seats: JV.str(r["seats"]),
                price: JV.int(r["price"]),
                phone: JV.str(r["phone"]),
                comment: JV.str(r["comment"]))
        }.reversed().map { $0 }
    }

    // Стрічка: комунальні повідомлення + новини
    static func alerts() async throws -> [CityAlert] {
        let json = JV.dict(try await Api.json("https://vilnohirsk-alerts-production.up.railway.app/api/alert", ttlMinutes: 5))
        func map(_ key: String) -> [CityAlert] {
            JV.dicts(json[key]).compactMap { a in
                guard JV.bool(a["show"], default: true) else { return nil }
                return CityAlert(kind: key, title: JV.str(a["title"]), text: JV.str(a["text"]))
            }
        }
        return map("communal") + map("news")
    }

    static func ticker() async -> [String] {
        guard let json = try? await Api.json("https://vilnohirsk-ticker-api-production.up.railway.app/api/ticker", ttlMinutes: 2) else { return [] }
        return JV.strings(JV.dict(json)["messages"])
    }

    static func phonebook() async throws -> [PhonebookCategory] {
        let json = try await Api.json("https://vilnohirsk-phonebook-production.up.railway.app/api/phonebook", ttlMinutes: 30)
        let categories = (json as? [Any]).map { JV.dicts($0) } ?? JV.dicts(JV.dict(json)["categories"])
        return categories.compactMap { c in
            let items = JV.dicts(c["items"]).compactMap { item -> PhonebookEntry? in
                let title = JV.str(item["title"]).isEmpty ? JV.str(item["name"]) : JV.str(item["title"])
                var phones = JV.strings(item["phones"])
                if phones.isEmpty {
                    let raw = JV.str(item["phones"]).isEmpty ? JV.str(item["phone"]) : JV.str(item["phones"])
                    phones = raw.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                }
                guard !title.isEmpty else { return nil }
                return PhonebookEntry(title: title, phones: phones)
            }
            guard !items.isEmpty else { return nil }
            let name = JV.str(c["name"]).isEmpty ? JV.str(c["category"]) : JV.str(c["name"])
            let icon = JV.str(c["icon"]).isEmpty ? "📌" : JV.str(c["icon"])
            return PhonebookCategory(name: name, icon: icon, items: items)
        }
    }

    // MARK: Оголошення (Google Sheets CSV — ті самі таблиці, що читає сайт)

    private static let sheetBase = "https://docs.google.com/spreadsheets/d/10MgSaPFFh0mDE094UkrG1BQwHabmGvSg124F5B4T1lg/gviz/tq?tqx=out:csv&gid="

    private static func approved(_ table: CSVLite.Table) -> [[String]] {
        table.rows.filter { row in
            let status = table.value(row, contains: ["статус", "status"], fallback: row.count - 1)
            return status.lowercased() == "одобрено"
        }
    }

    private static func photoList(_ raw: String) -> [String] {
        raw.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    static func fleaMarket() async throws -> [Listing] {
        let table = CSVLite.Table(try await Api.text(sheetBase + "111977759", ttlMinutes: 3))
        return approved(table).map { row in
            Listing(
                title: table.value(row, contains: ["назва"], fallback: 1),
                price: table.value(row, contains: ["ціна"], fallback: 2),
                category: table.value(row, contains: ["категорія"], fallback: 6),
                condition: table.value(row, contains: ["стан"], fallback: 7),
                location: table.value(row, contains: ["місто", "локація"], fallback: 8),
                description: table.value(row, contains: ["опис"], fallback: 3),
                phone: table.value(row, contains: ["телефон"], fallback: 4),
                photos: photoList(table.value(row, contains: ["фото"], fallback: 5)),
                isVip: !table.value(row, contains: ["vip"]).isEmpty)
        }
        .filter { $0.location.lowercased().contains("вільно") || $0.location.lowercased().contains("вильно") || $0.location.isEmpty }
        .reversed().map { $0 }
    }

    static func estate() async throws -> [EstateItem] {
        let table = CSVLite.Table(try await Api.text(sheetBase + "622618191", ttlMinutes: 3))
        return approved(table).map { row in
            EstateItem(
                dealType: table.value(row, contains: ["тип угоди", "угода"], fallback: 2),
                propertyType: table.value(row, contains: ["об'єкт", "тип об"], fallback: 3),
                rooms: table.value(row, contains: ["кімнат"], fallback: 4),
                price: table.value(row, contains: ["ціна"], fallback: 5),
                description: table.value(row, contains: ["опис"], fallback: 6),
                phone: table.value(row, contains: ["телефон"], fallback: 7),
                photos: photoList(table.value(row, contains: ["фото"], fallback: 8)),
                isVip: !table.value(row, contains: ["vip"]).isEmpty)
        }.reversed().map { $0 }
    }

    static func lostFound() async throws -> [LostItem] {
        let table = CSVLite.Table(try await Api.text(sheetBase + "624471689", ttlMinutes: 3))
        return approved(table).map { row in
            LostItem(
                title: table.value(row, contains: ["назва", "речі"]),
                type: table.value(row, contains: ["що сталося", "тип"]),
                category: table.value(row, contains: ["категорія"]),
                location: table.value(row, contains: ["локація", "місто", "адреса"]),
                description: table.value(row, contains: ["опис", "обставини"]),
                phone: table.value(row, contains: ["телефон", "контакт"]),
                photos: photoList(table.value(row, contains: ["фото", "світлина"])))
        }.reversed().map { $0 }
    }

    static func jobs() async throws -> [Job] {
        var jobs: [Job] = []
        // Вакансії з API (Дніпропетровський центр зайнятості)
        if let apiJobs = try? await Api.json("https://vilnohirsk-jobs-api-production.up.railway.app/api/jobs", ttlMinutes: 1) {
            jobs += JV.dicts(apiJobs).map { j in
                Job(
                    title: JV.str(j["title"]),
                    salary: JV.str(j["salary"]),
                    company: JV.str(j["company"]),
                    description: JV.str(j["description"]),
                    date: JV.str(j["date"]),
                    phone: JV.str(j["phone"]),
                    gender: JV.str(j["gender"]),
                    employment: JV.str(j["employment"]),
                    isVip: false)
            }
        }
        // Вакансії, додані мешканцями через форму сайту
        if let csv = try? await Api.text(sheetBase + "1809375718", ttlMinutes: 3) {
            let table = CSVLite.Table(csv)
            jobs += approved(table).map { row in
                Job(
                    title: table.value(row, contains: ["посада"], fallback: 2),
                    salary: table.value(row, contains: ["зарплата"], fallback: 3),
                    company: table.value(row, contains: ["компанія"], fallback: 4),
                    description: table.value(row, contains: ["опис"], fallback: 5),
                    date: table.value(row, contains: ["дата"]).components(separatedBy: " ").first ?? "",
                    phone: table.value(row, contains: ["телефон"], fallback: 6),
                    gender: table.value(row, contains: ["стать", "кого"], fallback: 7),
                    employment: table.value(row, contains: ["зайнятість"], fallback: 8),
                    isVip: !table.value(row, contains: ["vip"]).isEmpty)
            }.reversed()
        }
        return jobs
    }

    static func promos() async throws -> [Promo] {
        let json = try await Api.json("https://vilnohirsk-promos-api-production.up.railway.app/api/promos", ttlMinutes: 5)
        let list = (json as? [Any]).map { JV.dicts($0) } ?? JV.dicts(JV.dict(json)["promos"])
        return list.compactMap { p in
            guard JV.bool(p["active"], default: true) else { return nil }
            return Promo(
                shop: JV.str(p["shop"]),
                title: JV.str(p["title"]),
                discount: JV.str(p["discount"]),
                validUntil: JV.str(p["validUntil"]),
                description: JV.str(p["description"]),
                phone: JV.str(p["phone"]),
                photos: JV.strings(p["photos"]),
                isVip: JV.bool(p["vip"]))
        }.reversed().map { $0 }
    }

    static func shops() async throws -> [Shop] {
        let json = try await Api.json("https://vilnohirsk-shops-production.up.railway.app/api/shops", ttlMinutes: 5)
        let dict = JV.dict(json)
        var list = JV.dicts(dict["shops"])
        if list.isEmpty { list = JV.dicts(dict["items"]) }
        if list.isEmpty { list = (json as? [Any]).map { JV.dicts($0) } ?? [] }
        return list.compactMap { s in
            let name = JV.str(s["name"])
            guard !name.isEmpty else { return nil }
            var photos = JV.strings(s["photos"])
            if photos.isEmpty {
                let single = JV.str(s["photo"]).isEmpty ? JV.str(s["image"]) : JV.str(s["photo"])
                if !single.isEmpty { photos = [single] }
            }
            return Shop(
                name: name,
                category: JV.str(s["category"]),
                address: JV.str(s["address"]),
                schedule: JV.str(s["schedule"]),
                phones: JV.str(s["phone"]).components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty },
                photos: photos,
                instagram: JV.str(s["instagram"]),
                contactless: JV.bool(s["contactless"]),
                isVip: JV.bool(s["vip"]))
        }
    }

    static func events() async throws -> [EventPoster] {
        let json = try await Api.json("https://raw.githubusercontent.com/denris87/vilnohirsk-events/main/events.json", ttlMinutes: 5)
        return JV.dicts(json).compactMap { e in
            guard JV.bool(e["show"], default: true) else { return nil }
            var photo = JV.str(e["photo"])
            if photo.isEmpty { photo = JV.str(e["image"]) }
            if photo.isEmpty { photo = JV.str(e["url"]) }
            guard !photo.isEmpty else { return nil }
            return EventPoster(photo: photo, title: JV.str(e["title"]))
        }
    }

    static func fundraisers() async throws -> [Fundraiser] {
        let json = try await Api.json("https://vilnohirsk-volunteers-api-production.up.railway.app/api/volunteers", ttlMinutes: 1)
        let list = (json as? [Any]).map { JV.dicts($0) } ?? JV.dicts(JV.dict(json)["volunteers"])
        return list.compactMap { v in
            guard JV.bool(v["active"], default: true) else { return nil }
            let jar = JV.str(v["jar_url"])
            return Fundraiser(
                title: JV.str(v["title"]).isEmpty ? "ЗБІР НА ЗСУ" : JV.str(v["title"]),
                description: JV.str(v["description"]),
                jarURL: jar.hasPrefix("http") ? jar : "",
                cardNumber: JV.str(v["card_number"]),
                collected: JV.int(v["collected"]),
                goal: JV.int(v["goal"]))
        }
    }

    static func missingPersons() async -> [MissingPerson] {
        guard let json = try? await Api.json("https://vilnohirsk-phoenix-api-production.up.railway.app/api/phoenix", ttlMinutes: 5) else { return [] }
        let list = (json as? [Any]).map { JV.dicts($0) } ?? JV.dicts(JV.dict(json)["phoenix"])
        return list.compactMap { p in
            guard JV.bool(p["active"], default: true) else { return nil }
            return MissingPerson(
                name: JV.str(p["name"]),
                callsign: JV.str(p["callsign"]),
                dob: JV.str(p["dob"]),
                dateMissing: JV.str(p["date_missing"]),
                photos: JV.strings(p["photos"]))
        }
    }
}
