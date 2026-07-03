import SwiftUI
import WebKit

/// Домашня адреса сайту. Головний фрейм лишається на цьому домені,
/// усі зовнішні посилання відкриваються у Safari чи відповідному застосунку.
private let homeURL = URL(string: "https://vilnohirsk.online")!

@MainActor
final class WebViewModel: ObservableObject {
    @Published var isLoading = true
    @Published var loadFailed = false

    weak var webView: WKWebView?

    func retry() {
        loadFailed = false
        isLoading = true
        guard let webView else { return }
        if webView.url != nil {
            webView.reload()
        } else {
            webView.load(URLRequest(url: homeURL))
        }
    }
}

struct WebView: UIViewRepresentable {
    @ObservedObject var model: WebViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 30 / 255, green: 60 / 255, blue: 114 / 255, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        let refresh = UIRefreshControl()
        refresh.tintColor = .white
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.handleRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        model.webView = webView
        webView.load(URLRequest(url: homeURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private let model: WebViewModel

        init(model: WebViewModel) {
            self.model = model
        }

        @objc func handleRefresh(_ sender: UIRefreshControl) {
            model.webView?.reload()
        }

        private func isInternal(_ url: URL) -> Bool {
            guard let host = url.host?.lowercased() else { return true }
            return host == "vilnohirsk.online" || host.hasSuffix(".vilnohirsk.online")
        }

        // Головний фрейм: свій домен — у застосунку, решта — у системі (Safari, Telegram, Дзвінки…)
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            let scheme = url.scheme?.lowercased() ?? ""
            if scheme != "http" && scheme != "https" && scheme != "about" && scheme != "blob" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
            if isMainFrame, (scheme == "http" || scheme == "https"), !isInternal(url) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        // Посилання з target="_blank"
        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                if isInternal(url) {
                    webView.load(URLRequest(url: url))
                } else {
                    UIApplication.shared.open(url)
                }
            }
            return nil
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.isLoading = true
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.isLoading = false
            model.loadFailed = false
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView,
                     didFailProvisionalNavigation navigation: WKNavigation!,
                     withError error: Error) {
            finishWithError(webView, error: error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            finishWithError(webView, error: error)
        }

        private func finishWithError(_ webView: WKWebView, error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
            model.isLoading = false
            let code = (error as NSError).code
            // Скасування навігації (напр. відкрили зовнішнє посилання) — не помилка
            if code == NSURLErrorCancelled { return }
            if webView.url == nil || code == NSURLErrorNotConnectedToInternet {
                model.loadFailed = true
            }
        }

        // JS alert()/confirm() із сайту показуємо нативними діалогами
        func webView(_ webView: WKWebView,
                     runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping () -> Void) {
            presentAlert(message: message, actions: [
                UIAlertAction(title: "OK", style: .default) { _ in completionHandler() }
            ], onUnavailable: completionHandler)
        }

        func webView(_ webView: WKWebView,
                     runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping (Bool) -> Void) {
            presentAlert(message: message, actions: [
                UIAlertAction(title: "Скасувати", style: .cancel) { _ in completionHandler(false) },
                UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) }
            ], onUnavailable: { completionHandler(false) })
        }

        private func presentAlert(message: String, actions: [UIAlertAction], onUnavailable: () -> Void) {
            guard let scene = UIApplication.shared.connectedScenes
                    .compactMap({ $0 as? UIWindowScene })
                    .first(where: { $0.activationState == .foregroundActive }),
                  let root = scene.keyWindow?.rootViewController else {
                onUnavailable()
                return
            }
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            actions.forEach(alert.addAction)
            var presenter = root
            while let presented = presenter.presentedViewController {
                presenter = presented
            }
            presenter.present(alert, animated: true)
        }
    }
}
