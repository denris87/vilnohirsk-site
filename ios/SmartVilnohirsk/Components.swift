import SwiftUI

// MARK: - Стан завантаження екрана

enum Load<T> {
    case loading
    case failed
    case loaded(T)
}

struct LoadingCard: View {
    var body: some View {
        HStack {
            Spacer()
            ProgressView().tint(Diia.blue)
            Spacer()
        }
        .padding(.vertical, 40)
    }
}

struct ErrorCard: View {
    let retry: () -> Void
    var body: some View {
        VStack(spacing: 12) {
            Text("📡").font(.system(size: 40))
            Text("Не вдалося завантажити дані")
                .font(.diiaBody(15))
                .foregroundColor(Diia.ink)
            Button(action: retry) {
                Text("Спробувати ще раз")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(Diia.blue, in: Capsule())
            }
        }
        .frame(maxWidth: .infinity)
        .diiaCard()
    }
}

struct EmptyCard: View {
    let text: String
    var body: some View {
        VStack(spacing: 8) {
            Text("🕊️").font(.system(size: 36))
            Text(text)
                .font(.diiaBody(14))
                .foregroundColor(Diia.sub)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .diiaCard()
    }
}

// MARK: - Каркас екрана розділу

struct SectionScreen<Content: View>: View {
    let title: String
    let emoji: String
    let subtitle: String?
    let content: Content

    init(title: String, emoji: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.emoji = emoji
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Text(emoji).font(.system(size: 26))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title).font(.diiaTitle(22)).foregroundColor(Diia.ink)
                        if let subtitle {
                            Text(subtitle).font(.system(size: 12)).foregroundColor(Diia.sub)
                        }
                    }
                    Spacer()
                }
                .padding(.top, 4)
                content
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Diia.bg.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Дрібні елементи

struct Chip: View {
    let text: String
    var color: Color = Diia.blue
    var filled: Bool = false
    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(filled ? .white : color)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(filled ? color : color.opacity(0.12), in: Capsule())
    }
}

struct FilterChipsRow: View {
    let items: [String]
    @Binding var selection: String
    var color: Color = Diia.blue
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    Button {
                        selection = item
                    } label: {
                        Chip(text: item, color: color, filled: selection == item)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }
}

struct PhoneButton: View {
    let phone: String
    var compact: Bool = false
    var body: some View {
        let clean = phone.filter { "0123456789+".contains($0) }
        if clean.count >= 7, let url = URL(string: "tel:\(clean)") {
            Link(destination: url) {
                HStack(spacing: 6) {
                    Image(systemName: "phone.fill").font(.system(size: 12, weight: .bold))
                    Text(compact ? "Подзвонити" : phone)
                        .font(.system(size: 13, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(Diia.green, in: Capsule())
            }
        }
    }
}

struct InfoRow: View {
    let icon: String
    let label: String
    let value: String
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(icon).font(.system(size: 15))
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.system(size: 11, weight: .bold)).foregroundColor(Diia.sub)
                Text(value).font(.diiaBody(14)).foregroundColor(Diia.ink)
            }
            Spacer(minLength: 0)
        }
    }
}

// Фото з Google Drive: перетворює посилання на пряме зображення (як на сайті)
func driveImageURL(_ raw: String) -> URL? {
    let url = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !url.isEmpty else { return nil }
    var fileId = ""
    if let range = url.range(of: "id=") {
        fileId = String(url[range.upperBound...]).components(separatedBy: "&")[0]
    } else if let range = url.range(of: "/d/") {
        fileId = String(url[range.upperBound...]).components(separatedBy: "/")[0]
    }
    if fileId.isEmpty { return URL(string: url) }
    return URL(string: "https://drive.google.com/thumbnail?id=\(fileId)&sz=w1000")
}

struct RemotePhoto: View {
    let raw: String
    var height: CGFloat = 120
    var body: some View {
        Group {
            if let url = driveImageURL(raw) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure:
                        placeholder
                    default:
                        ZStack { Diia.bg; ProgressView() }
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var placeholder: some View {
        ZStack {
            Diia.bg
            Text("🖼️").font(.system(size: 28))
        }
    }
}

struct PhotoStrip: View {
    let photos: [String]
    var body: some View {
        if !photos.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(photos.indices, id: \.self) { i in
                        RemotePhoto(raw: photos[i], height: 160)
                            .frame(width: 220)
                    }
                }
            }
        }
    }
}
