import SwiftUI
import MapKit

extension Color {
    // Колір із рядка виду "#38bdf8" (кольори категорій приходять із YAML сайту)
    init(hexString: String, fallback: Color = Diia.blue) {
        var s = hexString.trimmingCharacters(in: .whitespaces).lowercased()
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 6, let v = UInt32(s, radix: 16) {
            self.init(hex: v)
        } else {
            self = fallback
        }
    }
}

// MARK: - Світло

struct SvitloScreen: View {
    @State private var state: Load<SvitloBoard?> = .loading

    var body: some View {
        SectionScreen(title: "Відключення світла", emoji: "💡", subtitle: "графік по чергах · ЦЕК і ДТЕК") {
            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let board):
                if let board {
                    statusCard(board)
                    ForEach(board.providers) { provider in
                        providerCard(provider)
                    }
                } else {
                    EmptyCard(text: "Графік тимчасово не публікується")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        do {
            state = .loaded(try await CityData.svitlo())
        } catch {
            state = .failed
        }
    }

    private func statusCard(_ board: SvitloBoard) -> some View {
        VStack(spacing: 8) {
            Text(board.hasOutages ? "⚡" : "✅").font(.system(size: 40))
            Text(board.hasOutages ? "Сьогодні є відключення" : "Сьогодні відключень немає")
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundColor(.white)
            Text(board.hasOutages ? "перевірте свою чергу нижче" : "світло має бути цілий день")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white.opacity(0.85))
            if !board.updated.isEmpty {
                Text("станом на \(board.updated)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
            }
            if !board.revised.isEmpty {
                Text("оновлено о \(board.revised)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .background(
            board.hasOutages ? Diia.red : Diia.green,
            in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: (board.hasOutages ? Diia.red : Diia.green).opacity(0.3), radius: 10, x: 0, y: 5)
    }

    private func providerCard(_ provider: SvitloProvider) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Chip(text: provider.name, color: Color(hexString: provider.colorHex), filled: true)
            ForEach(provider.queues) { queue in
                HStack(alignment: .top) {
                    Text("\(queue.queue) черга")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Diia.ink)
                    Spacer()
                    if queue.slots.isEmpty {
                        Text("без відключень")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(Diia.green)
                    } else {
                        VStack(alignment: .trailing, spacing: 2) {
                            ForEach(queue.slots, id: \.self) { slot in
                                Text("⚡ \(slot)")
                                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                                    .foregroundColor(Diia.red)
                            }
                        }
                    }
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .background(Diia.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .diiaCard()
    }
}

// MARK: - Комуналка (повідомлення служб + новини міста)

struct CommunalScreen: View {
    @State private var state: Load<[CityAlert]> = .loading

    var body: some View {
        SectionScreen(title: "Комуналка", emoji: "🧾", subtitle: "повідомлення служб та новини міста") {
            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let alerts):
                if alerts.isEmpty {
                    EmptyCard(text: "Актуальних повідомлень немає")
                } else {
                    ForEach(alerts) { alert in
                        alertCard(alert)
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        state = ((try? await CityData.alerts()).map { Load.loaded($0) }) ?? .failed
    }

    private func alertCard(_ alert: CityAlert) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Chip(
                    text: alert.kind == "communal" ? "🔧 Комунальне" : "📰 Новина",
                    color: alert.kind == "communal" ? Diia.orange : Diia.green)
                Spacer()
            }
            if !alert.title.isEmpty {
                Text(alert.title)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundColor(Diia.ink)
            }
            if !alert.text.isEmpty {
                // Прибираємо розмітку **жирного**, яку адмін використовує на сайті
                Text(alert.text.replacingOccurrences(of: "<b>", with: "").replacingOccurrences(of: "</b>", with: ""))
                    .font(.diiaBody(13))
                    .foregroundColor(Diia.ink.opacity(0.85))
            }
        }
        .diiaCard()
    }
}

// MARK: - Карта міста

struct CityMapScreen: View {
    @State private var state: Load<[MapCategory]> = .loading
    @State private var selectedCategory = "Усе"
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 48.472, longitude: 34.012),
        span: MKCoordinateSpan(latitudeDelta: 0.035, longitudeDelta: 0.035))

    private struct Pin: Identifiable {
        let id = UUID()
        let place: MapPlace
        let icon: String
        let colorHex: String
    }

    var body: some View {
        SectionScreen(title: "Карта міста", emoji: "🗺️", subtitle: "важливі місця Вільногірська") {
            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let categories):
                FilterChipsRow(items: ["Усе"] + categories.map { $0.name }, selection: $selectedCategory, color: Diia.green)

                let pins = visiblePins(categories)
                Map(coordinateRegion: $region, annotationItems: pins) { pin in
                    MapAnnotation(coordinate: CLLocationCoordinate2D(latitude: pin.place.lat, longitude: pin.place.lng)) {
                        Text(pin.icon)
                            .font(.system(size: 14))
                            .padding(6)
                            .background(Color(hexString: pin.colorHex).opacity(0.9), in: Circle())
                            .overlay(Circle().stroke(.white, lineWidth: 2))
                            .shadow(radius: 3)
                    }
                }
                .frame(height: 340)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                ForEach(categories.filter { selectedCategory == "Усе" || $0.name == selectedCategory }) { category in
                    categoryCard(category)
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        state = ((try? await CityData.mapCategories()).map { Load.loaded($0) }) ?? .failed
    }

    private func visiblePins(_ categories: [MapCategory]) -> [Pin] {
        categories
            .filter { selectedCategory == "Усе" || $0.name == selectedCategory }
            .flatMap { category in
                category.places.map { Pin(place: $0, icon: category.icon, colorHex: category.colorHex) }
            }
    }

    private func categoryCard(_ category: MapCategory) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(category.icon) \(category.name)")
                .font(.system(size: 14, weight: .heavy))
                .foregroundColor(Diia.ink)
            ForEach(category.places) { place in
                Button {
                    withAnimation {
                        region.center = CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng)
                        region.span = MKCoordinateSpan(latitudeDelta: 0.008, longitudeDelta: 0.008)
                    }
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(place.name)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(Diia.ink)
                                .multilineTextAlignment(.leading)
                            if !place.address.isEmpty {
                                Text(place.address)
                                    .font(.system(size: 11))
                                    .foregroundColor(Diia.sub)
                            }
                        }
                        Spacer()
                        Image(systemName: "location.circle.fill")
                            .foregroundColor(Color(hexString: category.colorHex))
                    }
                    .padding(.vertical, 7)
                    .padding(.horizontal, 10)
                    .background(Diia.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .diiaCard()
    }
}

// MARK: - Довідник

struct PhonebookScreen: View {
    @State private var state: Load<[PhonebookCategory]> = .loading
    @State private var query = ""

    private let emergency: [(String, String, Color)] = [
        ("101", "ПОЖЕЖНА", Diia.red),
        ("102", "ПОЛІЦІЯ", Diia.blue),
        ("103", "ШВИДКА", Diia.green),
        ("104", "ГАЗ", Diia.orange),
    ]

    var body: some View {
        SectionScreen(title: "Міський довідник", emoji: "📒", subtitle: "контакти та служби міста") {
            HStack(spacing: 8) {
                ForEach(emergency, id: \.0) { number, label, color in
                    Link(destination: URL(string: "tel:\(number)")!) {
                        VStack(spacing: 2) {
                            Text(number)
                                .font(.system(size: 18, weight: .heavy, design: .rounded))
                                .foregroundColor(.white)
                            Text(label)
                                .font(.system(size: 8, weight: .heavy))
                                .foregroundColor(.white.opacity(0.9))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(color, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(Diia.sub)
                TextField("Пошук: назва або номер…", text: $query)
                    .font(.diiaBody(14))
            }
            .padding(12)
            .background(Diia.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let categories):
                let filtered = filter(categories)
                if filtered.isEmpty {
                    EmptyCard(text: "За запитом нічого не знайдено")
                } else {
                    ForEach(filtered) { category in
                        categoryCard(category)
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        state = ((try? await CityData.phonebook()).map { Load.loaded($0) }) ?? .failed
    }

    private func filter(_ categories: [PhonebookCategory]) -> [PhonebookCategory] {
        let q = query.lowercased().trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return categories }
        return categories.compactMap { category in
            let items = category.items.filter { item in
                item.title.lowercased().contains(q) || item.phones.contains { $0.contains(q) }
            }
            guard !items.isEmpty else { return nil }
            return PhonebookCategory(name: category.name, icon: category.icon, items: items)
        }
    }

    private func categoryCard(_ category: PhonebookCategory) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(category.icon) \(category.name)")
                .font(.system(size: 14, weight: .heavy))
                .foregroundColor(Diia.ink)
            ForEach(category.items) { item in
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Diia.ink)
                    HStack(spacing: 6) {
                        ForEach(item.phones, id: \.self) { phone in
                            PhoneButton(phone: phone)
                        }
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Diia.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .diiaCard()
    }
}
