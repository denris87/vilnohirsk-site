import SwiftUI

// MARK: - Події (афіша)

struct EventsScreen: View {
    @State private var state: Load<[EventPoster]> = .loading

    var body: some View {
        SectionScreen(title: "Події", emoji: "🎭", subtitle: "афіша Вільногірська") {
            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let events):
                if events.isEmpty {
                    EmptyCard(text: "Афіш поки немає")
                } else {
                    ForEach(events) { event in
                        VStack(alignment: .leading, spacing: 8) {
                            if !event.title.isEmpty {
                                Text(event.title)
                                    .font(.system(size: 14, weight: .heavy))
                                    .foregroundColor(Diia.ink)
                            }
                            RemotePhoto(raw: event.photo, height: 320)
                        }
                        .diiaCard(padding: 10)
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        state = ((try? await CityData.events()).map { Load.loaded($0) }) ?? .failed
    }
}

// MARK: - Підтримка ЗСУ

struct ZSUScreen: View {
    @State private var state: Load<[Fundraiser]> = .loading
    @State private var missing: [MissingPerson] = []
    @State private var copiedCard: String?

    var body: some View {
        SectionScreen(title: "Підтримка ЗСУ", emoji: "🇺🇦", subtitle: "збори вільногірців для наших") {
            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let items):
                if items.isEmpty {
                    emptyZSU
                } else {
                    totalCard(items)
                    ForEach(items) { fundraiser in
                        fundraiserCard(fundraiser)
                    }
                }
            }

            if !missing.isEmpty {
                Text("Зникли безвісти 🕯")
                    .font(.diiaTitle(17))
                    .foregroundColor(Diia.ink)
                    .padding(.top, 6)
                ForEach(missing) { person in
                    missingCard(person)
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        async let f = try? CityData.fundraisers()
        async let m = CityData.missingPersons()
        state = (await f).map { Load.loaded($0) } ?? .failed
        missing = await m
    }

    private var emptyZSU: some View {
        VStack(spacing: 10) {
            Text("💙💛").font(.system(size: 40))
            Text("Активних зборів зараз немає")
                .font(.system(size: 15, weight: .heavy))
                .foregroundColor(Diia.ink)
            Text("Маєте офіційний збір? Напишіть у Telegram @vilnohirsk")
                .font(.diiaBody(12))
                .foregroundColor(Diia.sub)
                .multilineTextAlignment(.center)
            Text("Слава Україні! 🇺🇦")
                .font(.system(size: 13, weight: .heavy))
                .foregroundColor(Diia.yellow)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .diiaCard()
    }

    private func totalCard(_ items: [Fundraiser]) -> some View {
        let total = items.reduce(0) { $0 + $1.collected }
        return VStack(alignment: .leading, spacing: 4) {
            Text("РАЗОМ ЗІБРАНО")
                .font(.system(size: 10, weight: .heavy))
                .foregroundColor(.white.opacity(0.8))
            Text("\(uaGrouped(total)) грн")
                .font(.system(size: 28, weight: .heavy, design: .rounded))
                .foregroundColor(.white)
            Text("за активними зборами міста 💙💛")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white.opacity(0.85))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(
            LinearGradient(colors: [Color(hex: 0x2B5CD9), Color(hex: 0x1B3B8C)], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func fundraiserCard(_ item: Fundraiser) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(item.title)
                .font(.system(size: 15, weight: .heavy))
                .foregroundColor(Diia.ink)
            if !item.description.isEmpty {
                Text(item.description)
                    .font(.diiaBody(12))
                    .foregroundColor(Diia.sub)
            }
            if item.goal > 0 {
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text("Зібрано: \(uaGrouped(item.collected)) ₴")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundColor(Diia.green)
                        Spacer()
                        Text("Ціль: \(uaGrouped(item.goal)) ₴")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(Diia.sub)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Diia.line)
                            Capsule()
                                .fill(LinearGradient(colors: [Diia.sky, Diia.yellow], startPoint: .leading, endPoint: .trailing))
                                .frame(width: geo.size.width * CGFloat(item.percent) / 100)
                        }
                    }
                    .frame(height: 8)
                    Text("\(item.percent)% зібрано")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Diia.sub)
                }
            }
            if !item.jarURL.isEmpty, let url = URL(string: item.jarURL) {
                Link(destination: url) {
                    Label("Банка Monobank", systemImage: "link")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Diia.yellow, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
            if !item.cardNumber.isEmpty {
                Button {
                    UIPasteboard.general.string = item.cardNumber.filter { $0.isNumber || $0.isLetter }
                    copiedCard = item.cardNumber
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("НОМЕР КАРТКИ")
                                .font(.system(size: 9, weight: .heavy))
                                .foregroundColor(Diia.sub)
                            Text(item.cardNumber)
                                .font(.system(size: 15, weight: .heavy, design: .monospaced))
                                .foregroundColor(Diia.ink)
                        }
                        Spacer()
                        Text(copiedCard == item.cardNumber ? "✓ Скопійовано" : "📋 Копіювати")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(Diia.blue)
                    }
                    .padding(12)
                    .background(Diia.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .diiaCard()
    }

    private func missingCard(_ person: MissingPerson) -> some View {
        HStack(spacing: 12) {
            if let photo = person.photos.first {
                RemotePhoto(raw: photo, height: 84)
                    .frame(width: 66)
            } else {
                Text("🕯")
                    .font(.system(size: 24))
                    .frame(width: 66, height: 84)
                    .background(Diia.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 4) {
                Chip(text: "Зник безвісти", color: Diia.red, filled: true)
                Text(person.name)
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundColor(Diia.ink)
                if !person.callsign.isEmpty {
                    Text("Позивний: «\(person.callsign)»")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Diia.orange)
                }
                HStack(spacing: 10) {
                    if !person.dob.isEmpty {
                        Text("нар. \(person.dob)").font(.system(size: 10)).foregroundColor(Diia.sub)
                    }
                    if !person.dateMissing.isEmpty {
                        Text("зник \(person.dateMissing)").font(.system(size: 10, weight: .bold)).foregroundColor(Diia.red)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .diiaCard()
    }
}

// MARK: - Зв'язок

struct ConnectScreen: View {
    @State private var showSite = false

    var body: some View {
        SectionScreen(title: "Зв'язок", emoji: "💬", subtitle: "адміністрація та соцмережі міста") {
            linkCard(
                emoji: "✍️",
                title: "Написати адмінам",
                subtitle: "ідеї, помилки, пропозиції — у Telegram",
                url: "https://t.me/vilnohirsk",
                color: Diia.sky)

            linkCard(
                emoji: "📢",
                title: "Телеграм-канал міста",
                subtitle: "новини та важливі сповіщення",
                url: "https://t.me/volnogorsk",
                color: Diia.blue)

            linkCard(
                emoji: "👥",
                title: "Facebook-спільнота",
                subtitle: "група «Вільногірськ Online»",
                url: "https://www.facebook.com/groups/vilnohirskOnline",
                color: Diia.blue)

            linkCard(
                emoji: "📸",
                title: "Instagram",
                subtitle: "@vilnohirsk_online",
                url: "https://www.instagram.com/vilnohirsk_online/",
                color: Diia.pink)

            Button {
                showSite = true
            } label: {
                HStack(spacing: 12) {
                    Text("🌐")
                        .font(.system(size: 20))
                        .frame(width: 46, height: 46)
                        .background(Diia.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Відкрити сайт")
                            .font(.system(size: 14, weight: .heavy))
                            .foregroundColor(Diia.ink)
                        Text("vilnohirsk.online — повна версія, форми та push")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(Diia.sub)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Diia.sub)
                }
                .diiaCard()
            }
            .buttonStyle(.plain)

            Text("Push-сповіщення міста працюють через сайт (PWA). Додайте vilnohirsk.online на екран «Додому» в Safari, щоб їх отримувати.")
                .font(.system(size: 11))
                .foregroundColor(Diia.sub)
                .padding(.horizontal, 4)
        }
        .sheet(isPresented: $showSite) { SiteSheet() }
    }

    private func linkCard(emoji: String, title: String, subtitle: String, url: String, color: Color) -> some View {
        Group {
            if let link = URL(string: url) {
                Link(destination: link) {
                    HStack(spacing: 12) {
                        Text(emoji)
                            .font(.system(size: 20))
                            .frame(width: 46, height: 46)
                            .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(title)
                                .font(.system(size: 14, weight: .heavy))
                                .foregroundColor(Diia.ink)
                            Text(subtitle)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(Diia.sub)
                        }
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(Diia.sub)
                    }
                    .diiaCard()
                }
            }
        }
    }
}

// MARK: - Сайт у вбудованому вікні (форми додавання, повна версія)

struct SiteSheet: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var model = WebViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 30 / 255, green: 60 / 255, blue: 114 / 255).ignoresSafeArea()
                WebView(model: model)
                    .ignoresSafeArea(edges: .bottom)
                if model.isLoading && !model.loadFailed {
                    ProgressView().tint(.white)
                }
            }
            .navigationTitle("vilnohirsk.online")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Готово") { dismiss() }
                }
            }
        }
    }
}
