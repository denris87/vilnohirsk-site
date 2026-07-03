import SwiftUI

struct ContentView: View {
    @StateObject private var model = WebViewModel()

    var body: some View {
        ZStack {
            // Фон у кольорах сайту, щоб не було білих спалахів під час завантаження
            Color(red: 30 / 255, green: 60 / 255, blue: 114 / 255)
                .ignoresSafeArea()

            WebView(model: model)
                .ignoresSafeArea()

            if model.isLoading && model.loadFailed == false {
                ProgressView()
                    .controlSize(.large)
                    .tint(.white)
            }

            if model.loadFailed {
                offlineView
            }
        }
    }

    private var offlineView: some View {
        VStack(spacing: 16) {
            Text("📡")
                .font(.system(size: 56))
            Text("Немає з'єднання")
                .font(.title2.bold())
                .foregroundColor(.white)
            Text("Перевірте інтернет і спробуйте ще раз.")
                .font(.body)
                .foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center)
            Button {
                model.retry()
            } label: {
                Text("Оновити")
                    .font(.headline)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 12)
                    .background(Color.white.opacity(0.15), in: Capsule())
                    .foregroundColor(.white)
            }
        }
        .padding(32)
    }
}

#Preview {
    ContentView()
}
