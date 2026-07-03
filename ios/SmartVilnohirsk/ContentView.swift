import SwiftUI

// MARK: - Розділи міста

enum CitySection: String, CaseIterable, Identifiable {
    case trains, buses, rides, svitlo, communal, map, phonebook
    case flea, estate, shopping, jobs, lost, events, zsu, connect

    var id: String { rawValue }

    var title: String {
        switch self {
        case .trains: return "Електрички"
        case .buses: return "Автобуси"
        case .rides: return "Попутники"
        case .svitlo: return "Світло"
        case .communal: return "Комуналка"
        case .map: return "Карта міста"
        case .phonebook: return "Довідник"
        case .flea: return "Барахолка"
        case .estate: return "Нерухомість"
        case .shopping: return "Шопінг"
        case .jobs: return "Робота"
        case .lost: return "Загублено"
        case .events: return "Події"
        case .zsu: return "ЗСУ"
        case .connect: return "Зв'язок"
        }
    }

    var emoji: String {
        switch self {
        case .trains: return "🚆"
        case .buses: return "🚌"
        case .rides: return "🚗"
        case .svitlo: return "💡"
        case .communal: return "🧾"
        case .map: return "🗺️"
        case .phonebook: return "📒"
        case .flea: return "🛒"
        case .estate: return "🏠"
        case .shopping: return "🛍️"
        case .jobs: return "💼"
        case .lost: return "🔍"
        case .events: return "🎭"
        case .zsu: return "🇺🇦"
        case .connect: return "💬"
        }
    }

    var tint: Color {
        switch self {
        case .trains: return Diia.blue
        case .buses: return Diia.teal
        case .rides: return Diia.orange
        case .svitlo: return Diia.yellow
        case .communal: return Diia.sky
        case .map: return Diia.green
        case .phonebook: return Diia.purple
        case .flea: return Diia.green
        case .estate: return Diia.orange
        case .shopping: return Diia.pink
        case .jobs: return Diia.blue
        case .lost: return Diia.purple
        case .events: return Diia.red
        case .zsu: return Diia.yellow
        case .connect: return Diia.sky
        }
    }

    @ViewBuilder var destination: some View {
        switch self {
        case .trains: TrainsScreen()
        case .buses: BusesScreen()
        case .rides: RidesScreen()
        case .svitlo: SvitloScreen()
        case .communal: CommunalScreen()
        case .map: CityMapScreen()
        case .phonebook: PhonebookScreen()
        case .flea: FleaScreen()
        case .estate: EstateScreen()
        case .shopping: ShoppingScreen()
        case .jobs: JobsScreen()
        case .lost: LostFoundScreen()
        case .events: EventsScreen()
        case .zsu: ZSUScreen()
        case .connect: ConnectScreen()
        }
    }
}

// MARK: - Головний екран

struct ContentView: View {
    @State private var weather: Weather?
    @State private var rates: Rates?
    @State private var fuel: FuelBoard?
    @State private var svitlo: SvitloBoard?
    @State private var ticker: [String] = []

    private let grid = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    headerCard
                    svitloCard
                    HStack(alignment: .top, spacing: 12) {
                        ratesCard
                        fuelCard
                    }
                    Text("Сервіси")
                        .font(.diiaTitle(18))
                        .foregroundColor(Diia.ink)
                        .padding(.top, 4)
                    servicesGrid
                    zsuBanner
                    if !ticker.isEmpty { tickerBlock }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Diia.bg.ignoresSafeArea())
            .navigationBarHidden(true)
            .refreshable { await loadAll() }
            .task { await loadAll() }
        }
        .tint(Diia.blue)
    }

    @MainActor
    private func loadAll() async {
        async let w = try? CityData.weather()
        async let r = CityData.rates()
        async let f = try? CityData.fuel()
        async let s = try? CityData.svitlo()
        async let t = CityData.ticker()
        weather = await w
        rates = await r
        fuel = await f ?? nil
        svitlo = await s ?? nil
        ticker = await t
    }

    // MARK: Шапка: місто, дата, час, погода

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Вільногірськ")
                        .font(.diiaTitle(24))
                        .foregroundColor(Diia.ink)
                    Text("СМАРТ-МІСТО · \(todayLine())")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Diia.sub)
                        .textCase(.uppercase)
                }
                Spacer()
                NavigationLink { ConnectScreen() } label: {
                    Text("🔔")
                        .font(.system(size: 18))
                        .padding(10)
                        .background(Diia.bg, in: Circle())
                }
            }
            HStack(alignment: .center) {
                Text(Date.now, style: .time)
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .foregroundColor(Diia.ink)
                Spacer()
                if let weather {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(weather.emoji).font(.system(size: 24))
                        Text("\(weather.temperature)°C")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(Diia.ink)
                        Text("вітер \(weather.wind) м/с")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Diia.sub)
                    }
                }
            }
        }
        .diiaCard()
    }

    private func todayLine() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "uk_UA")
        formatter.dateFormat = "EEEE, d MMMM"
        return formatter.string(from: Date())
    }

    // MARK: Світло

    private var svitloCard: some View {
        NavigationLink { SvitloScreen() } label: {
            HStack(spacing: 12) {
                if let svitlo {
                    if svitlo.hasOutages {
                        badge("⚡", Diia.red)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Сьогодні є відключення")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(Diia.red)
                            Text("подробиці за чергами — у графіку")
                                .font(.system(size: 12))
                                .foregroundColor(Diia.sub)
                        }
                    } else {
                        badge("✅", Diia.green)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Сьогодні відключень немає")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(Diia.green)
                            Text("світло має бути цілий день")
                                .font(.system(size: 12))
                                .foregroundColor(Diia.sub)
                        }
                    }
                } else {
                    badge("💡", Diia.yellow)
                    Text("Відключення світла")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(Diia.ink)
                }
                Spacer()
                Chip(text: "Графік", color: Diia.blue)
            }
            .diiaCard()
        }
        .buttonStyle(.plain)
    }

    private func badge(_ emoji: String, _ color: Color) -> some View {
        Text(emoji)
            .font(.system(size: 20))
            .frame(width: 44, height: 44)
            .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: Курс та пальне

    private var ratesCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("💱 КУРС ВАЛЮТ")
                .font(.system(size: 10, weight: .heavy))
                .foregroundColor(Diia.sub)
            if let rates {
                rateRow("🇺🇸 USD", rates.usdBuy, rates.usdSell)
                rateRow("🇪🇺 EUR", rates.eurBuy, rates.eurSell)
            } else {
                Text("—").font(.diiaBody()).foregroundColor(Diia.sub)
            }
        }
        .diiaCard(padding: 14)
    }

    private func rateRow(_ name: String, _ buy: String, _ sell: String) -> some View {
        HStack {
            Text(name).font(.system(size: 12, weight: .bold)).foregroundColor(Diia.ink)
            Spacer()
            Text("\(buy) / \(sell)")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundColor(Diia.blue)
        }
    }

    private var fuelCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("⛽ ПАЛЬНЕ · ГРН/Л")
                .font(.system(size: 10, weight: .heavy))
                .foregroundColor(Diia.sub)
            if let fuel {
                let columns = [GridItem(.flexible()), GridItem(.flexible())]
                LazyVGrid(columns: columns, alignment: .leading, spacing: 6) {
                    ForEach(fuel.fuels) { f in
                        VStack(alignment: .leading, spacing: 0) {
                            Text(f.name)
                                .font(.system(size: 10, weight: .heavy))
                                .foregroundColor(Diia.sub)
                            Text(f.price)
                                .font(.system(size: 13, weight: .bold, design: .rounded))
                                .foregroundColor(Diia.ink)
                        }
                    }
                }
            } else {
                Text("—").font(.diiaBody()).foregroundColor(Diia.sub)
            }
        }
        .diiaCard(padding: 14)
    }

    // MARK: Сервіси

    private var servicesGrid: some View {
        LazyVGrid(columns: grid, spacing: 10) {
            ForEach(CitySection.allCases) { section in
                NavigationLink {
                    section.destination
                } label: {
                    VStack(spacing: 6) {
                        Text(section.emoji)
                            .font(.system(size: 22))
                            .frame(width: 48, height: 48)
                            .background(section.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                        Text(section.title)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(Diia.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Diia.card)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 3)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: Підтримка ЗСУ

    private var zsuBanner: some View {
        NavigationLink { ZSUScreen() } label: {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Підтримати ЗСУ 💙💛")
                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                    Text("актуальні збори міста")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white.opacity(0.85))
                }
                Spacer()
                Text("Донат")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(Color(hex: 0x1B3B8C))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 9)
                    .background(Diia.yellow, in: Capsule())
            }
            .padding(16)
            .background(
                LinearGradient(colors: [Color(hex: 0x2B5CD9), Color(hex: 0x1B3B8C)], startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: Color(hex: 0x2B5CD9).opacity(0.3), radius: 10, x: 0, y: 5)
        }
        .buttonStyle(.plain)
    }

    // MARK: Зараз у місті

    private var tickerBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Зараз у місті")
                .font(.diiaTitle(18))
                .foregroundColor(Diia.ink)
            ForEach(ticker.indices, id: \.self) { i in
                HStack(alignment: .top, spacing: 10) {
                    Text("🟢").font(.system(size: 12)).padding(.top, 2)
                    Text(ticker[i])
                        .font(.diiaBody(13))
                        .foregroundColor(Diia.ink)
                    Spacer(minLength: 0)
                }
                .diiaCard(padding: 12)
            }
        }
        .padding(.top, 4)
    }
}

#Preview {
    ContentView()
}
