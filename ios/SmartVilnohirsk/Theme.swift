import SwiftUI

// Дизайн-система у стилі «Дії»: світлий фон, білі картки, м'які тіні,
// заголовки із заокругленим накресленням, кольорові акценти розділів.
enum Diia {
    static let bg = Color(hex: 0xEEF1F7)
    static let card = Color.white
    static let ink = Color(hex: 0x17181C)
    static let sub = Color(hex: 0x7A8194)
    static let line = Color(hex: 0xE4E8F0)

    static let blue = Color(hex: 0x2C6BEA)
    static let sky = Color(hex: 0x38BDF8)
    static let green = Color(hex: 0x18A05E)
    static let yellow = Color(hex: 0xF5B90B)
    static let orange = Color(hex: 0xF08616)
    static let red = Color(hex: 0xE0364B)
    static let purple = Color(hex: 0x8B5CF6)
    static let teal = Color(hex: 0x0D9488)
    static let pink = Color(hex: 0xEC4899)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

struct DiiaCardStyle: ViewModifier {
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Diia.card)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: Color.black.opacity(0.05), radius: 10, x: 0, y: 4)
    }
}

extension View {
    func diiaCard(padding: CGFloat = 16) -> some View {
        modifier(DiiaCardStyle(padding: padding))
    }
}

extension Font {
    static func diiaTitle(_ size: CGFloat = 22) -> Font {
        .system(size: size, weight: .bold, design: .rounded)
    }
    static func diiaBody(_ size: CGFloat = 14) -> Font {
        .system(size: size, weight: .medium)
    }
}

// Форматування чисел як на сайті: 1 247 350
func uaGrouped(_ value: Int) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.groupingSeparator = "\u{202F}"
    return formatter.string(from: NSNumber(value: value)) ?? String(value)
}
