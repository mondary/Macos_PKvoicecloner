// PK Voice Cloner — app native macOS : fenêtre WKWebView autour du serveur local
// FastAPI (app/serveur.py). Le serveur est un processus enfant ; quitter l'app
// l'arrête gracieusement (/api/arreter) pour libérer le modèle. `--stop` garde
// la compatibilité avec arreter-studio.sh.
import AppKit
import WebKit
import Sparkle

let PORT = 8809
let urlStudio = URL(string: "http://127.0.0.1:\(PORT)")!

func dossierProjet() -> URL {
    if let env = ProcessInfo.processInfo.environment["PKVOICE_PROJET"], !env.isEmpty {
        return URL(fileURLWithPath: (env as NSString).expandingTildeInPath, isDirectory: true)
    }
    return FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Documents/GitHub/PROJECTS/Macos_PKvoicecloner", isDirectory: true)
}

func serveurVivant() -> Bool {
    var req = URLRequest(url: URL(string: "http://127.0.0.1:\(PORT)/api/etat")!)
    req.timeoutInterval = 1.5
    let sem = DispatchSemaphore(value: 0)
    var vivant = false
    URLSession.shared.dataTask(with: req) { _, response, _ in
        vivant = (response as? HTTPURLResponse)?.statusCode == 200
        sem.signal()
    }.resume()
    _ = sem.wait(timeout: .now() + 2)
    return vivant
}

func arreterServeurBloquant(delaiMax: Double = 6) {
    var req = URLRequest(url: URL(string: "http://127.0.0.1:\(PORT)/api/arreter")!)
    req.httpMethod = "POST"
    req.timeoutInterval = 2
    let sem = DispatchSemaphore(value: 0)
    URLSession.shared.dataTask(with: req) { _, _, _ in sem.signal() }.resume()
    _ = sem.wait(timeout: .now() + 3)
    let echeance = Date().addingTimeInterval(delaiMax)
    while serveurVivant() && Date() < echeance {
        Thread.sleep(forTimeInterval: 0.2)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow?
    var webView: WKWebView?
    var serveur: Process?
    var updaterController: SPUStandardUpdaterController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        if CommandLine.arguments.contains("--stop") {
            arreterServeurBloquant()
            NSApp.terminate(nil)
            return
        }
        construireMenu()
        construireFenetre()
        if serveurVivant() {
            chargerStudio()
        } else {
            afficherAttente("Démarrage du studio…")
            demarrerServeur()
            attendrePuisCharger()
        }
    }

    // MARK: - Menu

    func construireMenu() {
        let menu = NSMenu()
        let itemApp = NSMenuItem()
        menu.addItem(itemApp)
        let sousMenu = NSMenu()
        sousMenu.addItem(NSMenuItem(title: "À propos de PK Voice Cloner",
                                    action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: ""))
        sousMenu.addItem(.separator())
        let maj = NSMenuItem(title: "Rechercher les mises à jour…", action: #selector(checkForUpdates), keyEquivalent: "u")
        sousMenu.addItem(maj)
        sousMenu.addItem(.separator())
        sousMenu.addItem(NSMenuItem(title: "Quitter PK Voice Cloner",
                                    action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        itemApp.submenu = sousMenu
        NSApp.mainMenu = menu
    }

    @objc func checkForUpdates() {
        updaterController?.checkForUpdates(nil)
    }

    private func setupUpdater() {
        guard Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") != nil else { return } // désactivé hors release
        updaterController = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
    }

    // MARK: - Fenêtre

    func construireFenetre() {
        setupUpdater()
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable],
                         backing: .buffered, defer: false)
        w.title = "PK Voice Cloner"
        w.minSize = NSSize(width: 640, height: 560)
        let cfg = WKWebViewConfiguration()
        cfg.preferences.isElementFullscreenEnabled = true
        let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 820), configuration: cfg)
        wv.autoresizingMask = [.width, .height]
        wv.navigationDelegate = self
        wv.setValue(false, forKey: "drawsBackground")
        w.backgroundColor = NSColor(red: 1.0, green: 0.98, blue: 0.96, alpha: 1) // --white chaud de l'interface
        w.contentView = wv
        w.center()
        window = w
        webView = wv
        w.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func afficherAttente(_ texte: String) {
        let html = """
        <body style="margin:0;height:100vh;display:grid;place-items:center;background:#fffaf6;
                     font-family:-apple-system,sans-serif;color:#3a2f29;">
          <div style="text-align:center">
            <div style="width:34px;height:34px;margin:0 auto 18px;border:3px solid #e9e4dc;
                        border-top-color:#df5d45;border-radius:50%;animation:r .8s linear infinite"></div>
            <style>@keyframes r{to{transform:rotate(360deg)}}</style>
            <div style="font-size:15px">\(texte)</div>
            <div style="margin-top:6px;color:#8d8178;font-size:13px">Le modèle de synthèse se prépare en arrière-plan.</div>
          </div>
        </body>
        """
        webView?.loadHTMLString(html, baseURL: nil)
    }

    func chargerStudio() {
        webView?.load(URLRequest(url: urlStudio))
    }

    func attendrePuisCharger(tentatives: Int = 90) {
        if serveurVivant() {
            chargerStudio()
            return
        }
        if tentatives <= 0 {
            afficherAttente("Le studio ne répond pas.")
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.attendrePuisCharger(tentatives: tentatives - 1)
        }
    }

    // MARK: - Serveur Python

    func demarrerServeur() {
        let projet = dossierProjet()
        let python = projet.appendingPathComponent(".venv/bin/python")
        let script = projet.appendingPathComponent("app/serveur.py")
        guard FileManager.default.isExecutableFile(atPath: python.path),
              FileManager.default.fileExists(atPath: script.path) else {
            let alerte = NSAlert()
            alerte.messageText = "Environnement introuvable"
            alerte.informativeText = """
            L'environnement Python du studio n'existe pas encore dans :
            \(projet.path)

            Installe-le une fois avec :
            curl -fsSL https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/install.sh | sh
            """
            alerte.runModal()
            NSApp.terminate(nil)
            return
        }
        let p = Process()
        p.executableURL = python
        p.arguments = [script.path]
        p.currentDirectoryURL = projet
        var env = ProcessInfo.processInfo.environment
        env["PYTHONUNBUFFERED"] = "1"
        p.environment = env
        let log = projet.appendingPathComponent("data/logs/serveur.log")
        try? FileManager.default.createDirectory(at: log.deletingLastPathComponent(), withIntermediateDirectories: true)
        if !FileManager.default.fileExists(atPath: log.path) {
            FileManager.default.createFile(atPath: log.path, contents: nil)
        }
        if let handle = try? FileHandle(forWritingTo: log) {
            _ = try? handle.seekToEnd()
            p.standardOutput = handle
            p.standardError = handle
        }
        do {
            try p.run()
            serveur = p
        } catch {
            afficherAttente("Impossible de lancer le serveur : \(error.localizedDescription)")
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        if serveurVivant() {
            arreterServeurBloquant()
        }
        if let p = serveur, p.isRunning {
            p.terminate()
        }
    }
}

@main
struct PKVoiceClonerApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }
}
