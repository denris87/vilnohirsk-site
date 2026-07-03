import SwiftUI

// Поточний час у Києві (хвилини від опівночі)
func kyivNowMinutes() -> Int {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "Europe/Kyiv") ?? .current
    let parts = calendar.dateComponents([.hour, .minute], from: Date())
    return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
}

func timeToMinutes(_ time: String) -> Int? {
    let parts = time.components(separatedBy: ":")
    guard parts.count >= 2,
          let h = Int(parts[0].filter { $0.isNumber }),
          let m = Int(parts[1].prefix(2)) else { return nil }
    return h * 60 + m
}

// MARK: - Електрички + Потяги

struct TrainsScreen: View {
    @State private var mode = 0 // 0 — електрички, 1 — потяги
    @State private var suburban: Load<[Train]> = .loading
    @State private var long: Load<[Train]> = .loading
    @State private var delays: [TrainDelay] = []
    @State private var expanded: UUID?

    var body: some View {
        SectionScreen(title: mode == 0 ? "Електрички" : "Потяги", emoji: "🚆", subtitle: "розклад на сьогодні · Вільногірськ") {
            Picker("", selection: $mode) {
                Text("Електрички").tag(0)
                Text("Потяги").tag(1)
            }
            .pickerStyle(.segmented)

            if mode == 0 {
                ForEach(delays) { delay in
                    delayBanner(delay)
                }
                trainList(suburban, showStatus: true)
            } else {
                trainList(long, showStatus: false)
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        async let d = CityData.delays()
        async let s = try? CityData.trains()
        async let l = try? CityData.longTrains()
        delays = await d
        suburban = (await s).map { Load.loaded($0) } ?? .failed
        long = (await l).map { Load.loaded($0) } ?? .failed
    }

    private func delayBanner(_ delay: TrainDelay) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("⏰").font(.system(size: 18))
            VStack(alignment: .leading, spacing: 2) {
                Text("№\(delay.number) \(delay.route)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Diia.ink)
                Text("затримується на +\(delay.minutes) хв")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Diia.red)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Diia.red.opacity(0.08))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Diia.red.opacity(0.25)))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder
    private func trainList(_ state: Load<[Train]>, showStatus: Bool) -> some View {
        switch state {
        case .loading:
            LoadingCard()
        case .failed:
            ErrorCard { Task { await load() } }
        case .loaded(let trains):
            if trains.isEmpty {
                EmptyCard(text: "Даних поки немає")
            } else {
                ForEach(trains) { train in
                    TrainCard(train: train, showStatus: showStatus, isExpanded: expanded == train.id) {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            expanded = expanded == train.id ? nil : train.id
                        }
                    }
                }
            }
        }
    }
}

struct TrainCard: View {
    let train: Train
    let showStatus: Bool
    let isExpanded: Bool
    let toggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: toggle) {
                HStack(spacing: 12) {
                    Text(train.number)
                        .font(.system(size: 13, weight: .heavy, design: .rounded))
                        .foregroundColor(Diia.blue)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(Diia.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(train.route)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(Diia.ink)
                            .multilineTextAlignment(.leading)
                        if train.hasChanges {
                            Chip(text: "зміни в розкладі", color: Diia.orange)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(statusText)
                            .font(.system(size: 15, weight: .heavy, design: .rounded))
                            .foregroundColor(statusColor)
                        Text("відпр.")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(Diia.sub)
                    }
                }
            }
            .buttonStyle(.plain)

            if isExpanded {
                Divider().padding(.vertical, 10)
                if train.stops.isEmpty {
                    Text("Немає даних про зупинки")
                        .font(.diiaBody(12))
                        .foregroundColor(Diia.sub)
                } else {
                    VStack(spacing: 5) {
                        ForEach(train.stops.indices, id: \.self) { i in
                            let stop = train.stops[i]
                            HStack {
                                Text("\(i + 1). \(stop.0)")
                                    .font(.system(size: 12, weight: stop.0.contains("Вільногірськ") ? .heavy : .medium))
                                    .foregroundColor(stop.0.contains("Вільногірськ") ? Diia.blue : Diia.ink)
                                Spacer()
                                Text(stop.1)
                                    .font(.system(size: 12, weight: .bold, design: .rounded))
                                    .foregroundColor(Diia.sub)
                            }
                        }
                    }
                }
                if train.hasChanges {
                    Text(train.note)
                        .font(.diiaBody(12))
                        .foregroundColor(Diia.orange)
                        .padding(.top, 10)
                }
            }
        }
        .diiaCard()
    }

    private var minutesLeft: Int? {
        guard let t = timeToMinutes(train.time) else { return nil }
        return t - kyivNowMinutes()
    }

    private var statusText: String {
        if showStatus, let left = minutesLeft, left >= 0, left <= 10 {
            return "≈ \(left) хв"
        }
        return train.time
    }

    private var statusColor: Color {
        guard showStatus, let left = minutesLeft else { return Diia.ink }
        if left < 0 { return Diia.sub }
        if left <= 10 { return Diia.orange }
        return Diia.green
    }
}

// MARK: - Автобуси

struct BusesScreen: View {
    @State private var state: Load<[BusRoute]> = .loading
    @State private var expanded: UUID?
    @State private var openStops: Set<UUID> = []

    var body: some View {
        SectionScreen(title: "Автобуси", emoji: "🚌", subtitle: "міські та приміські маршрути") {
            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let buses):
                if buses.isEmpty {
                    EmptyCard(text: "Розкладів поки немає")
                } else {
                    ForEach(buses) { bus in
                        busCard(bus)
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        state = ((try? await CityData.buses()).map { Load.loaded($0) }) ?? .failed
    }

    private func busCard(_ bus: BusRoute) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    expanded = expanded == bus.id ? nil : bus.id
                }
            } label: {
                HStack(spacing: 12) {
                    Text("🚌")
                        .font(.system(size: 18))
                        .frame(width: 40, height: 40)
                        .background(Diia.teal.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    Text(bus.route)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Diia.ink)
                        .multilineTextAlignment(.leading)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Diia.sub)
                        .rotationEffect(.degrees(expanded == bus.id ? 180 : 0))
                }
            }
            .buttonStyle(.plain)

            if expanded == bus.id {
                Divider().padding(.vertical, 10)
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(bus.directions) { direction in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(direction.title.uppercased())
                                .font(.system(size: 10, weight: .heavy))
                                .foregroundColor(Diia.teal)
                            ForEach(direction.rows) { row in
                                busRow(row)
                            }
                        }
                    }
                    if !bus.note.isEmpty {
                        Text(bus.note).font(.diiaBody(12)).foregroundColor(Diia.orange)
                    }
                    if !bus.info.isEmpty {
                        Text(bus.info).font(.diiaBody(12)).foregroundColor(Diia.sub)
                    }
                }
            }
        }
        .diiaCard()
    }

    @ViewBuilder
    private func busRow(_ row: BusRow) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                guard !row.stops.isEmpty else { return }
                withAnimation(.easeInOut(duration: 0.2)) {
                    if openStops.contains(row.id) { openStops.remove(row.id) } else { openStops.insert(row.id) }
                }
            } label: {
                HStack {
                    Text(row.label + (row.stops.isEmpty ? "" : " ▾"))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Diia.ink)
                        .multilineTextAlignment(.leading)
                    Spacer()
                    Text(row.time)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(Diia.sub)
                }
            }
            .buttonStyle(.plain)

            if openStops.contains(row.id) {
                VStack(spacing: 3) {
                    ForEach(row.stops.indices, id: \.self) { i in
                        HStack {
                            Text(row.stops[i].0)
                                .font(.system(size: 11))
                                .foregroundColor(Diia.sub)
                            Spacer()
                            Text(row.stops[i].1)
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                .foregroundColor(Diia.sub)
                        }
                    }
                }
                .padding(.leading, 12)
                .padding(.vertical, 4)
            }
        }
    }
}

// MARK: - Попутники

struct RidesScreen: View {
    @State private var state: Load<[Ride]> = .loading
    @State private var mode = 0 // 0 — водії, 1 — пасажири
    @State private var showSite = false

    var body: some View {
        SectionScreen(title: "Попутники", emoji: "🚗", subtitle: "спільні поїздки з міста") {
            Picker("", selection: $mode) {
                Text("Водії").tag(0)
                Text("Пасажири").tag(1)
            }
            .pickerStyle(.segmented)

            switch state {
            case .loading:
                LoadingCard()
            case .failed:
                ErrorCard { Task { await load() } }
            case .loaded(let rides):
                let filtered = rides.filter { $0.isDriver == (mode == 0) }
                if filtered.isEmpty {
                    EmptyCard(text: mode == 0 ? "Пропозицій водіїв немає" : "Запитів пасажирів немає")
                } else {
                    ForEach(filtered) { ride in
                        rideCard(ride)
                    }
                }
            }

            Button {
                showSite = true
            } label: {
                Label("Додати поїздку", systemImage: "plus.circle.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Diia.orange, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
        .sheet(isPresented: $showSite) { SiteSheet() }
        .task { await load() }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        state = ((try? await CityData.rides()).map { Load.loaded($0) }) ?? .failed
    }

    private func rideCard(_ ride: Ride) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(ride.from) — \(ride.to)")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundColor(Diia.ink)
                Spacer()
                if ride.isDriver {
                    Text(ride.price > 0 ? "\(ride.price) грн" : "Договірна")
                        .font(.system(size: 14, weight: .heavy, design: .rounded))
                        .foregroundColor(Diia.orange)
                }
            }
            HStack(spacing: 12) {
                Text("🗓 \(ride.date)")
                Text("🕒 \(ride.time)")
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(Diia.sub)
            HStack {
                Text("👤 \(ride.name)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Diia.ink)
                Spacer()
                Chip(text: ride.isDriver ? "💺 місць: \(ride.seats)" : "🧍 потрібно: \(ride.seats)", color: Diia.blue)
            }
            if !ride.comment.isEmpty {
                Text("💬 \(ride.comment)")
                    .font(.diiaBody(12))
                    .foregroundColor(Diia.sub)
            }
            HStack {
                Spacer()
                PhoneButton(phone: ride.phone)
            }
        }
        .diiaCard()
    }
}
