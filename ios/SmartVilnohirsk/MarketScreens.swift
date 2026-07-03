import SwiftUI

// MARK: - Барахолка

struct FleaScreen: View {
    @State private var state: Load<[Listing]> = .loading
    @State private var category = "Усе"
    @State private var selected: Listing?
    @State private var showSite = false

    private let grid = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        SectionScreen(title: "Барахолка", emoji: "🛒", subtitle: "оголошення мешканців · Вільногірськ") {
            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let items):
                FilterChipsRow(items: categories(items), selection: $category, color: Diia.green)
                let filtered = items.filter { category == "Усе" || $0.category.contains(category) }
                if filtered.isEmpty {
                    EmptyCard(text: "Оголошень у цій категорії немає")
                } else {
                    LazyVGrid(columns: grid, spacing: 10) {
                        ForEach(filtered) { item in
                            listingTile(item)
                        }
                    }
                }
            }
            addButton(title: "Додати оголошення", color: Diia.green) { showSite = true }
        }
        .sheet(item: $selected) { ListingDetail(listing: $0) }
        .sheet(isPresented: $showSite) { SiteSheet() }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        state = ((try? await CityData.fleaMarket()).map { Load.loaded($0) }) ?? .failed
    }

    private func categories(_ items: [Listing]) -> [String] {
        var seen: [String] = []
        for item in items where !item.category.isEmpty && !seen.contains(item.category) {
            seen.append(item.category)
        }
        return ["Усе"] + seen
    }

    private func listingTile(_ item: Listing) -> some View {
        Button {
            selected = item
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                ZStack(alignment: .topLeading) {
                    RemotePhoto(raw: item.photos.first ?? "", height: 110)
                    if item.isVip {
                        Chip(text: "VIP", color: Diia.yellow, filled: true).padding(6)
                    }
                }
                Text(item.title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Diia.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(priceLabel(item.price, suffix: "грн"))
                    .font(.system(size: 14, weight: .heavy, design: .rounded))
                    .foregroundColor(Diia.green)
                Text("\(item.condition.isEmpty ? "" : item.condition + " · ")\(item.category)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Diia.sub)
                    .lineLimit(1)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Diia.card)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 3)
        }
        .buttonStyle(.plain)
    }
}

func priceLabel(_ raw: String, suffix: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { return "Договірна" }
    if trimmed.lowercased().contains(suffix.lowercased()) || trimmed.contains("$") { return trimmed }
    return "\(trimmed) \(suffix)"
}

func addButton(title: String, color: Color, action: @escaping () -> Void) -> some View {
    Button(action: action) {
        Label(title, systemImage: "plus.circle.fill")
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(color, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct ListingDetail: View {
    let listing: Listing
    var body: some View {
        DetailSheet(title: listing.title) {
            PhotoStrip(photos: listing.photos)
            Text(priceLabel(listing.price, suffix: "грн"))
                .font(.system(size: 24, weight: .heavy, design: .rounded))
                .foregroundColor(Diia.green)
            InfoRow(icon: "📌", label: "КАТЕГОРІЯ", value: listing.category)
            if !listing.condition.isEmpty {
                InfoRow(icon: "✨", label: "СТАН", value: listing.condition)
            }
            if !listing.location.isEmpty {
                InfoRow(icon: "📍", label: "ЛОКАЦІЯ", value: listing.location)
            }
            InfoRow(icon: "📝", label: "ОПИС", value: listing.description)
            PhoneButton(phone: listing.phone)
        }
    }
}

// Спільна обгортка для детальних вікон
struct DetailSheet<Content: View>: View {
    let title: String
    let content: Content
    @Environment(\.dismiss) private var dismiss

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    content
                }
                .padding(16)
            }
            .background(Diia.bg.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Готово") { dismiss() }
                }
            }
        }
        .presentationDetents([.large, .medium])
    }
}

// MARK: - Нерухомість

struct EstateScreen: View {
    @State private var state: Load<[EstateItem]> = .loading
    @State private var deal = "Усе"
    @State private var selected: EstateItem?
    @State private var showSite = false

    var body: some View {
        SectionScreen(title: "Нерухомість", emoji: "🏠", subtitle: "продаж та оренда · Вільногірськ") {
            FilterChipsRow(items: ["Усе", "Продаж", "Оренда"], selection: $deal, color: Diia.orange)
            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let items):
                let filtered = items.filter { deal == "Усе" || $0.dealType.localizedCaseInsensitiveContains(deal) }
                if filtered.isEmpty {
                    EmptyCard(text: "Оголошень у цій категорії немає")
                } else {
                    ForEach(filtered) { item in
                        estateCard(item)
                    }
                }
            }
            addButton(title: "Додати нерухомість", color: Diia.orange) { showSite = true }
        }
        .sheet(item: $selected) { item in
            DetailSheet(title: "\(item.propertyType) · \(item.dealType)") {
                PhotoStrip(photos: item.photos)
                Text(priceLabel(item.price, suffix: "$"))
                    .font(.system(size: 24, weight: .heavy, design: .rounded))
                    .foregroundColor(Diia.orange)
                InfoRow(icon: "🛏", label: "КІМНАТ", value: item.rooms)
                InfoRow(icon: "📝", label: "ОПИС ТА АДРЕСА", value: item.description)
                PhoneButton(phone: item.phone)
            }
        }
        .sheet(isPresented: $showSite) { SiteSheet() }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        state = ((try? await CityData.estate()).map { Load.loaded($0) }) ?? .failed
    }

    private func estateCard(_ item: EstateItem) -> some View {
        Button {
            selected = item
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Chip(
                        text: item.dealType,
                        color: item.dealType.lowercased().contains("оренда") ? Diia.sky : Diia.red)
                    Chip(text: item.propertyType, color: Diia.orange)
                    if item.isVip { Chip(text: "VIP", color: Diia.yellow, filled: true) }
                    Spacer()
                }
                if let photo = item.photos.first {
                    RemotePhoto(raw: photo, height: 150)
                }
                HStack {
                    Text(priceLabel(item.price, suffix: "$"))
                        .font(.system(size: 18, weight: .heavy, design: .rounded))
                        .foregroundColor(Diia.ink)
                    Spacer()
                    Text("Кімнат: \(item.rooms)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Diia.sub)
                }
                Text(item.description)
                    .font(.diiaBody(12))
                    .foregroundColor(Diia.sub)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .diiaCard()
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Шопінг (акції + магазини)

struct ShoppingScreen: View {
    @State private var promos: Load<[Promo]> = .loading
    @State private var shops: Load<[Shop]> = .loading
    @State private var selectedShop: Shop?
    @State private var selectedPromo: Promo?

    private let grid = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        SectionScreen(title: "Шопінг", emoji: "🛍️", subtitle: "магазини міста та акції") {
            Text("Акції тижня 🔥")
                .font(.diiaTitle(17))
                .foregroundColor(Diia.ink)

            switch promos {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let items):
                if items.isEmpty {
                    EmptyCard(text: "Активних акцій немає")
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(items) { promo in
                                promoCard(promo)
                            }
                        }
                    }
                }
            }

            Text("Магазини")
                .font(.diiaTitle(17))
                .foregroundColor(Diia.ink)
                .padding(.top, 4)

            switch shops {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let items):
                if items.isEmpty {
                    EmptyCard(text: "Магазинів поки немає")
                } else {
                    LazyVGrid(columns: grid, spacing: 10) {
                        ForEach(items) { shop in
                            shopTile(shop)
                        }
                    }
                }
            }
        }
        .sheet(item: $selectedShop) { shop in
            DetailSheet(title: shop.name) {
                PhotoStrip(photos: shop.photos)
                if !shop.category.isEmpty { InfoRow(icon: "🏷", label: "КАТЕГОРІЯ", value: shop.category) }
                if !shop.address.isEmpty { InfoRow(icon: "📍", label: "АДРЕСА", value: shop.address) }
                if !shop.schedule.isEmpty { InfoRow(icon: "🕒", label: "ГРАФІК РОБОТИ", value: shop.schedule) }
                InfoRow(icon: "💳", label: "ТЕРМІНАЛ", value: shop.contactless ? "є" : "немає")
                ForEach(shop.phones, id: \.self) { PhoneButton(phone: $0) }
                if !shop.instagram.isEmpty, let url = URL(string: shop.instagram) {
                    Link("📸 Instagram-сторінка", destination: url)
                        .font(.system(size: 14, weight: .bold))
                }
            }
        }
        .sheet(item: $selectedPromo) { promo in
            DetailSheet(title: promo.title) {
                PhotoStrip(photos: promo.photos)
                Text(promo.discount)
                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                    .foregroundColor(Diia.red)
                InfoRow(icon: "🏪", label: "ЗАКЛАД", value: promo.shop)
                InfoRow(icon: "⏳", label: "ДІЄ ДО", value: promo.validUntil)
                if !promo.description.isEmpty {
                    InfoRow(icon: "📋", label: "УМОВИ", value: promo.description)
                }
                PhoneButton(phone: promo.phone)
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        async let p = try? CityData.promos()
        async let s = try? CityData.shops()
        promos = (await p).map { Load.loaded($0) } ?? .failed
        shops = (await s).map { Load.loaded($0) } ?? .failed
    }

    private func promoCard(_ promo: Promo) -> some View {
        Button {
            selectedPromo = promo
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                Text(promo.discount)
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text(promo.title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white.opacity(0.95))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                Text("до \(promo.validUntil) · \(promo.shop)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(0.8))
                    .lineLimit(1)
            }
            .padding(14)
            .frame(width: 190, height: 110, alignment: .topLeading)
            .background(
                LinearGradient(
                    colors: promo.isVip ? [Diia.orange, Diia.red] : [Diia.red, Diia.purple],
                    startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func shopTile(_ shop: Shop) -> some View {
        Button {
            selectedShop = shop
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                RemotePhoto(raw: shop.photos.first ?? "", height: 90)
                Text(shop.name)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Diia.ink)
                    .lineLimit(1)
                Text(shop.category.isEmpty ? "Магазин" : shop.category)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Diia.sub)
                    .lineLimit(1)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Diia.card)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 3)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Робота

struct JobsScreen: View {
    @State private var state: Load<[Job]> = .loading
    @State private var selected: Job?
    @State private var showSite = false

    var body: some View {
        SectionScreen(title: "Робота", emoji: "💼", subtitle: "вакансії у місті") {
            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let jobs):
                if jobs.isEmpty {
                    EmptyCard(text: "Вакансій поки немає")
                } else {
                    ForEach(jobs) { job in
                        jobCard(job)
                    }
                }
            }
            addButton(title: "Додати вакансію", color: Diia.blue) { showSite = true }
        }
        .sheet(item: $selected) { job in
            DetailSheet(title: job.title) {
                Text(salaryLabel(job.salary))
                    .font(.system(size: 24, weight: .heavy, design: .rounded))
                    .foregroundColor(Diia.blue)
                InfoRow(icon: "🏢", label: "КОМПАНІЯ", value: job.company)
                if !job.employment.isEmpty { InfoRow(icon: "🕒", label: "ЗАЙНЯТІСТЬ", value: job.employment) }
                if !job.gender.isEmpty { InfoRow(icon: "👤", label: "КОГО ШУКАЮТЬ", value: job.gender) }
                if !job.description.isEmpty { InfoRow(icon: "📝", label: "ОПИС", value: job.description) }
                PhoneButton(phone: job.phone)
            }
        }
        .sheet(isPresented: $showSite) { SiteSheet() }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        state = ((try? await CityData.jobs()).map { Load.loaded($0) }) ?? .failed
    }

    private func salaryLabel(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty || trimmed == "-" { return "З/п договірна" }
        if trimmed.lowercased().contains("грн") { return trimmed }
        return "\(trimmed) грн"
    }

    private func jobCard(_ job: Job) -> some View {
        Button {
            selected = job
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(job.title)
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundColor(Diia.ink)
                        .multilineTextAlignment(.leading)
                    Spacer()
                    if job.isVip { Chip(text: "VIP", color: Diia.yellow, filled: true) }
                }
                Text(salaryLabel(job.salary))
                    .font(.system(size: 16, weight: .heavy, design: .rounded))
                    .foregroundColor(Diia.blue)
                Text(job.company)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Diia.sub)
                HStack(spacing: 6) {
                    if !job.employment.isEmpty { Chip(text: job.employment.lowercased(), color: Diia.teal) }
                    if !job.gender.isEmpty { Chip(text: job.gender.lowercased(), color: Diia.purple) }
                    Spacer()
                    if !job.date.isEmpty {
                        Text(job.date)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Diia.sub)
                    }
                }
            }
            .diiaCard()
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Загублено / Знайдено

struct LostFoundScreen: View {
    @State private var state: Load<[LostItem]> = .loading
    @State private var mode = 0 // 0 — загублено, 1 — знайдено
    @State private var selected: LostItem?
    @State private var showSite = false

    var body: some View {
        SectionScreen(title: "Загублено / Знайдено", emoji: "🔍", subtitle: "допомагаємо повернути речі") {
            Picker("", selection: $mode) {
                Text("Загублено").tag(0)
                Text("Знайдено").tag(1)
            }
            .pickerStyle(.segmented)

            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let items):
                let filtered = items.filter { $0.isFound == (mode == 1) }
                if filtered.isEmpty {
                    EmptyCard(text: "Оголошень немає")
                } else {
                    ForEach(filtered) { item in
                        lostCard(item)
                    }
                }
            }
            addButton(title: "Подати заявку", color: Diia.purple) { showSite = true }
        }
        .sheet(item: $selected) { item in
            DetailSheet(title: item.title) {
                PhotoStrip(photos: item.photos)
                Chip(text: item.type, color: item.isFound ? Diia.green : Diia.red, filled: true)
                InfoRow(icon: "📌", label: "КАТЕГОРІЯ", value: item.category)
                if !item.location.isEmpty { InfoRow(icon: "📍", label: "ЛОКАЦІЯ", value: item.location) }
                InfoRow(icon: "📝", label: "ОПИС ТА ОБСТАВИНИ", value: item.description)
                PhoneButton(phone: item.phone)
            }
        }
        .sheet(isPresented: $showSite) { SiteSheet() }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        state = ((try? await CityData.lostFound()).map { Load.loaded($0) }) ?? .failed
    }

    private func lostCard(_ item: LostItem) -> some View {
        Button {
            selected = item
        } label: {
            HStack(spacing: 12) {
                Text(iconFor(item.category))
                    .font(.system(size: 20))
                    .frame(width: 46, height: 46)
                    .background((item.isFound ? Diia.green : Diia.red).opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Diia.ink)
                        .multilineTextAlignment(.leading)
                    Text("\(item.category)\(item.location.isEmpty ? "" : " · " + item.location)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Diia.sub)
                        .lineLimit(1)
                }
                Spacer()
                Chip(text: item.isFound ? "Я знайшов" : "Загублено", color: item.isFound ? Diia.green : Diia.red)
            }
            .diiaCard()
        }
        .buttonStyle(.plain)
    }

    private func iconFor(_ category: String) -> String {
        let c = category.lowercased()
        if c.contains("ключ") { return "🔑" }
        if c.contains("тварин") { return "🐾" }
        if c.contains("документ") { return "📄" }
        if c.contains("електрон") { return "📱" }
        return "🎒"
    }
}
