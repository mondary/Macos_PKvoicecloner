import AppKit
import Combine
import SwiftUI

/// Keeps window requests alive when SwiftUI has no studio view mounted.
@MainActor
final class StudioWindowCoordinator: ObservableObject {
    static let sceneID = "main-studio"

    struct Request {
        let id = UUID()
        let settingsSection: PKSettingsSection?
    }

    @Published private(set) var request = Request(settingsSection: nil)
    var openStudioWindow: (() -> Void)?
    private weak var window: NSWindow?
    private var closeObserver: NSObjectProtocol?
    private var presentationPending = false
    private var updateCheckPending = false

    func present(settingsSection: PKSettingsSection? = nil, checkForUpdates: Bool = false) {
        // Menu tracking must finish before activating or opening a window.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.request = Request(settingsSection: settingsSection)
            self.presentationPending = true
            self.updateCheckPending = checkForUpdates
            self.openStudioWindow?()
            self.finishPresentation()
        }
    }

    func attach(_ window: NSWindow) {
        guard self.window !== window else { return }
        if let closeObserver { NotificationCenter.default.removeObserver(closeObserver) }
        self.window = window
        closeObserver = NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification, object: window, queue: .main
        ) { [weak self, weak window] _ in
            Task { @MainActor in
                guard let self, self.window === window else { return }
                self.window = nil
            }
        }
        finishPresentation()
    }

    private func finishPresentation() {
        guard presentationPending, let window else { return }
        if window.isMiniaturized { window.deminiaturize(nil) }
        NSApp.unhide(nil)
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        presentationPending = false
        if updateCheckPending {
            updateCheckPending = false
            UpdaterManager.shared.checkForUpdates()
        }
    }
}

/// Registers only the studio's own window, never a book or Sparkle window.
struct StudioWindowRegistration: NSViewRepresentable {
    let coordinator: StudioWindowCoordinator

    func makeNSView(context: Context) -> RegistrationView {
        let view = RegistrationView()
        view.onWindow = { [weak coordinator] window in coordinator?.attach(window) }
        return view
    }

    func updateNSView(_ view: RegistrationView, context: Context) {}

    final class RegistrationView: NSView {
        var onWindow: ((NSWindow) -> Void)?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            guard let window else { return }
            DispatchQueue.main.async { [weak self, weak window] in
                guard let self, let window else { return }
                self.onWindow?(window)
            }
        }
    }
}
