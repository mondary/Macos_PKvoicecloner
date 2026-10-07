import AppKit
import Combine
import Sparkle
import SwiftUI

private enum PKLanguage: String, CaseIterable, Identifiable {
    case fr, en, es, de
    var id: String { rawValue }
    var flag: String { ["fr": "🇫🇷", "en": "🇬🇧", "es": "🇪🇸", "de": "🇩🇪"][rawValue]! }
    static var current: PKLanguage {
        let stored = UserDefaults.standard.string(forKey: "app-language") ?? "fr"
        return PKLanguage(rawValue: stored) ?? .fr
    }
}

private enum PKSettingsSection: String, CaseIterable, Identifiable {
    case general, providers, huggingFace, credits, library, support, about
    var id: String { rawValue }
    var group: String {
        switch self {
        case .general, .providers, .huggingFace: "app"
        case .credits, .library, .support, .about: "pk"
        }
    }
    var icon: String {
        switch self {
        case .general: "slider.horizontal.3"
        case .providers: "network"
        case .huggingFace: "key.horizontal"
        case .credits: "text.book.closed"
        case .library: "square.grid.2x2"
        case .support: "heart.fill"
        case .about: "info.circle"
        }
    }
    var iconTint: Color? {
        switch self {
        case .support: Color(red: 1, green: 0.37, blue: 0.36)
        case .about: .accentColor
        default: nil
        }
    }
    func title(_ lang: PKLanguage) -> String {
        let values: [PKLanguage: [String: String]] = [
            .fr: ["general": "Général", "providers": "Providers IA", "huggingFace": "Clé Hugging Face", "credits": "Crédits", "library": "Bibliothèque de projets", "support": "Soutenir", "about": "À propos"],
            .en: ["general": "General", "providers": "AI Providers", "huggingFace": "Hugging Face Token", "credits": "Credits", "library": "Project Library", "support": "Support", "about": "About"],
            .es: ["general": "General", "providers": "Proveedores de IA", "huggingFace": "Token de Hugging Face", "credits": "Créditos", "library": "Biblioteca de proyectos", "support": "Apoyar", "about": "Acerca de"],
            .de: ["general": "Allgemein", "providers": "KI-Anbieter", "huggingFace": "Hugging-Face-Token", "credits": "Credits", "library": "Projektbibliothek", "support": "Unterstützen", "about": "Über"],
        ]
        return values[lang]?[rawValue] ?? rawValue
    }

    static func groupTitle(_ group: String, language: PKLanguage) -> String {
        if group == "app" {
            switch language {
            case .fr: "APPLICATION"
            case .en: "APP"
            case .es: "APLICACIÓN"
            case .de: "APP"
            }
        } else {
            switch language {
            case .fr: "PROJETS PK"
            case .en: "PK PROJECTS"
            case .es: "PROYECTOS PK"
            case .de: "PK-PROJEKTE"
            }
        }
    }
}

@MainActor
final class UpdaterManager: NSObject, ObservableObject {
    static let shared = UpdaterManager()
    static let stableFeedURL = "https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/appcast.xml"
    static let devFeedURL = "https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/appcast-dev.xml"

    @Published var canCheckForUpdates = false
    @Published private(set) var latestStableVersion: String?
    @Published private(set) var latestDevVersion: String?
    @Published private(set) var availableUpdateVersion: String?
    private var latestStableBuild: String?
    private var latestDevBuild: String?
    private let feedProvider = PKFeedProvider()
    private let controller: SPUStandardUpdaterController

    var channel: String {
        get { UserDefaults.standard.string(forKey: "updateChannel") ?? "stable" }
        set {
            UserDefaults.standard.set(newValue, forKey: "updateChannel")
            let isDevBuild = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "").localizedCaseInsensitiveContains("-dev")
            controller.updater.automaticallyDownloadsUpdates = isDevBuild || newValue == "dev"
            refreshUpdateAvailability()
        }
    }

    private override init() {
        controller = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: feedProvider, userDriverDelegate: nil)
        super.init()
        controller.updater.publisher(for: \.canCheckForUpdates).assign(to: &$canCheckForUpdates)
    }

    func start() {
        let isDevBuild = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "").localizedCaseInsensitiveContains("-dev")
        controller.updater.automaticallyDownloadsUpdates = isDevBuild || channel == "dev"
        controller.startUpdater()
        refreshVersions()
    }

    func checkForUpdates() {
        refreshVersions()
        NSApp.activate(ignoringOtherApps: true)
        controller.checkForUpdates(nil)
    }

    func refreshVersions() {
        Task {
            async let stable = Self.latestInfo(at: Self.stableFeedURL)
            async let dev = Self.latestInfo(at: Self.devFeedURL)
            let result = await (stable, dev)
            latestStableVersion = result.0?.shortVersion
            latestStableBuild = result.0?.buildVersion
            latestDevVersion = result.1?.shortVersion
            latestDevBuild = result.1?.buildVersion
            refreshUpdateAvailability()
        }
    }

    fileprivate func versionStatus(for channel: String) -> PKChannelVersionStatus {
        let installedVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        let installedChannel = installedVersion.localizedCaseInsensitiveContains("-dev") ? "dev" : "stable"
        guard channel == installedChannel else { return .otherChannel }
        guard let publishedBuild = channel == "dev" ? latestDevBuild : latestStableBuild,
              let installedBuild = Bundle.main.infoDictionary?["CFBundleVersion"] as? String,
              let order = compareBuildNumbers(publishedBuild, installedBuild) else { return .unavailable }
        switch order {
        case .orderedDescending: return .updateAvailable
        case .orderedSame: return .upToDate
        case .orderedAscending: return .installedAhead
        }
    }

    private func refreshUpdateAvailability() {
        let installedVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        let isDevBuild = installedVersion.localizedCaseInsensitiveContains("-dev")
        let channel = isDevBuild ? "dev" : self.channel
        let publishedBuild = channel == "dev" ? latestDevBuild : latestStableBuild
        let installedBuild = Bundle.main.infoDictionary?["CFBundleVersion"] as? String
        availableUpdateVersion = if let publishedBuild, let installedBuild,
                                    compareBuildNumbers(publishedBuild, installedBuild) == .orderedDescending {
            channel == "dev" ? latestDevVersion : latestStableVersion
        } else {
            nil
        }
    }

    private static func latestInfo(at string: String) async -> PKAppcastInfo? {
        guard var components = URLComponents(string: string) else { return nil }
        components.queryItems = (components.queryItems ?? []) + [URLQueryItem(name: "_pk_refresh", value: UUID().uuidString)]
        guard let url = components.url else { return nil }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        request.setValue("no-cache, no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        let parser = PKAppcastParser()
        let xml = XMLParser(data: data)
        xml.delegate = parser
        return xml.parse() ? parser.info : nil
    }
}

private enum PKChannelVersionStatus {
    case updateAvailable, upToDate, installedAhead, otherChannel, unavailable

    var symbol: String {
        switch self {
        case .updateAvailable: "arrow.down.circle.fill"
        case .upToDate: "checkmark.circle.fill"
        case .installedAhead: "arrow.up.circle.fill"
        case .otherChannel: "circle.dashed"
        case .unavailable: "questionmark.circle"
        }
    }
    var color: Color {
        switch self {
        case .updateAvailable: .accentColor
        case .upToDate: .green
        case .installedAhead: .orange
        case .otherChannel, .unavailable: .secondary
        }
    }
    func title(language: PKLanguage) -> String {
        switch self {
        case .updateAvailable: [PKLanguage.fr: "Mise à jour disponible", .en: "Update available", .es: "Actualización disponible", .de: "Update verfügbar"][language]!
        case .upToDate: [PKLanguage.fr: "À jour", .en: "Up to date", .es: "Actualizado", .de: "Aktuell"][language]!
        case .installedAhead: [PKLanguage.fr: "Version installée plus récente", .en: "Installed version is newer", .es: "La versión instalada es más reciente", .de: "Installierte Version ist neuer"][language]!
        case .otherChannel: [PKLanguage.fr: "Autre canal", .en: "Other channel", .es: "Otro canal", .de: "Anderer Kanal"][language]!
        case .unavailable: [PKLanguage.fr: "Version indisponible", .en: "Version unavailable", .es: "Versión no disponible", .de: "Version nicht verfügbar"][language]!
        }
    }
}

private struct PKAppcastInfo {
    let shortVersion: String
    let buildVersion: String
}

private func compareBuildNumbers(_ lhs: String, _ rhs: String) -> ComparisonResult? {
    func components(_ value: String) -> [UInt64]? {
        let parts = value.split(separator: ".")
        guard !parts.isEmpty else { return nil }
        let numbers = parts.compactMap { UInt64($0) }
        return numbers.count == parts.count ? numbers : nil
    }
    guard let left = components(lhs), let right = components(rhs) else { return nil }
    for index in 0..<max(left.count, right.count) {
        let a = index < left.count ? left[index] : 0
        let b = index < right.count ? right[index] : 0
        if a != b { return a < b ? .orderedAscending : .orderedDescending }
    }
    return .orderedSame
}

private final class PKFeedProvider: NSObject, SPUUpdaterDelegate {
    nonisolated func feedURLString(for updater: SPUUpdater) -> String? {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        let isDev = version.localizedCaseInsensitiveContains("-dev") || UserDefaults.standard.string(forKey: "updateChannel") == "dev"
        let address = isDev
            ? "https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/appcast-dev.xml"
            : "https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/appcast.xml"
        guard var components = URLComponents(string: address) else { return address }
        components.queryItems = (components.queryItems ?? []) + [URLQueryItem(name: "_pk_refresh", value: UUID().uuidString)]
        return components.url?.absoluteString ?? address
    }
}

private final class PKAppcastParser: NSObject, XMLParserDelegate {
    private var reading = false
    private var readingBuild = false
    private var text = ""
    private var shortVersion: String?
    private var buildVersion: String?
    var info: PKAppcastInfo? {
        guard let shortVersion, let buildVersion else { return nil }
        return PKAppcastInfo(shortVersion: shortVersion, buildVersion: buildVersion)
    }
    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        if elementName == "sparkle:shortVersionString" || qName == "sparkle:shortVersionString" { reading = true; text = "" }
        else if elementName == "sparkle:version" || qName == "sparkle:version" { readingBuild = true; text = "" }
    }
    func parser(_ parser: XMLParser, foundCharacters string: String) { if reading || readingBuild { text += string } }
    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        if reading && (elementName == "sparkle:shortVersionString" || qName == "sparkle:shortVersionString") {
            shortVersion = text.trimmingCharacters(in: .whitespacesAndNewlines); reading = false
        } else if readingBuild && (elementName == "sparkle:version" || qName == "sparkle:version") {
            buildVersion = text.trimmingCharacters(in: .whitespacesAndNewlines); readingBuild = false
        }
    }
}

struct SettingsWindowView: View {
    @ObservedObject var studio: Studio
    @ObservedObject private var updater = UpdaterManager.shared
    var onBack: (() -> Void)? = nil
    @State private var selection: PKSettingsSection = .general
    @State private var query = ""
    @State private var language = PKLanguage.current

    private var visible: [PKSettingsSection] {
        guard !query.isEmpty else { return PKSettingsSection.allCases }
        return PKSettingsSection.allCases.filter { $0.title(language).localizedCaseInsensitiveContains(query) || $0.rawValue.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    if let onBack {
                        Button(action: onBack) { Image(systemName: "chevron.left").font(.system(size: 12, weight: .semibold)).frame(width: 24, height: 24) }.buttonStyle(.plain).help(language == .fr ? "Retour au studio" : "Back to studio")
                    }
                    Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 34, height: 34).clipShape(RoundedRectangle(cornerRadius: 9))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("PK Voice Cloner").font(.headline)
                        Text(language == .fr ? "Studio vocal local" : "Local voice studio").font(.caption).foregroundStyle(.secondary)
                    }
                }.padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 24)
                Text([PKLanguage.fr: "RÉGLAGES", .en: "SETTINGS", .es: "AJUSTES", .de: "EINSTELLUNGEN"][language] ?? "SETTINGS")
                    .font(.system(size: 10, weight: .bold)).foregroundStyle(.tertiary).padding(.horizontal, 18).padding(.bottom, 8)
                HStack(spacing: 7) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField([PKLanguage.fr: "Rechercher", .en: "Search settings", .es: "Buscar ajustes", .de: "Einstellungen suchen"][language] ?? "Search settings", text: $query).textFieldStyle(.plain)
                }.padding(.horizontal, 10).frame(height: 30).background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 7)).padding(.horizontal, 10).padding(.bottom, 10)
                ForEach(["app", "pk"], id: \.self) { group in
                    let items = visible.filter { $0.group == group }
                    if !items.isEmpty {
                        Text(PKSettingsSection.groupTitle(group, language: language)).font(.system(size: 9, weight: .bold)).foregroundStyle(.tertiary).padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 4)
                        ForEach(items) { item in
                            Button { selection = item } label: {
                                HStack(spacing: 9) {
                                    Image(systemName: item.icon).frame(width: 18)
                                        .foregroundStyle(item.iconTint ?? (selection == item ? Color.primary : Color.secondary))
                                    Text(item.title(language))
                                        .font(.system(size: 12, weight: selection == item ? .semibold : .regular))
                                        .foregroundStyle(selection == item ? Color.primary : Color.secondary)
                                    Spacer(minLength: 0)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 10).frame(height: 34)
                                    .background(selection == item ? Color.accentColor.opacity(0.13) : .clear, in: RoundedRectangle(cornerRadius: 8))
                            }.buttonStyle(.plain).padding(.horizontal, 8)
                        }
                    }
                }
                Spacer()
                HStack(spacing: 6) {
                    ForEach(PKLanguage.allCases) { item in
                        Button(item.flag) { language = item; UserDefaults.standard.set(item.rawValue, forKey: "app-language") }
                            .buttonStyle(.plain).opacity(language == item ? 1 : 0.55)
                    }
                }.padding(.horizontal, 18).padding(.bottom, 10)
                HStack(spacing: 5) {
                    Text("PK Voice Cloner \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")")
                        .font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundStyle(.secondary)
                        .lineLimit(1).minimumScaleFactor(0.75)
                    if let available = updater.availableUpdateVersion {
                        Button { updater.checkForUpdates() } label: {
                            Label(available, systemImage: "arrow.down.circle.fill")
                                .font(.system(size: 9, weight: .semibold, design: .monospaced)).lineLimit(1)
                        }
                        .buttonStyle(.plain).foregroundStyle(Color.accentColor)
                        .help([PKLanguage.fr: "Installer la version", .en: "Install version", .es: "Instalar la versión", .de: "Version installieren"][language, default: "Install version"] + " \(available)")
                    }
                }
                .padding(.horizontal, 14).padding(.bottom, 18)
            }
            .frame(width: 220).background(.regularMaterial)
            Divider()
            Group {
                switch selection {
                case .general: general
                case .providers: ClesAPIView(studio: studio)
                case .huggingFace: huggingFace
                case .credits: PKCreditsView(language: language)
                case .library: PKProjectLibraryView(language: language)
                case .support: PKSupportView(language: language)
                case .about: PKAboutView(language: language)
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 980, minHeight: 650)
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear { language = .current; updater.refreshVersions() }
    }

    private var general: some View {
        VStack(alignment: .leading, spacing: 18) {
            settingsHeader(language == .fr ? "Général" : "General", language == .fr ? "Préférences du studio vocal." : "Voice studio preferences.", icon: "slider.horizontal.3")
            settingsCard(language == .fr ? "Icône de l’application" : "App icon", icon: "menubar.dock.rectangle") {
                Toggle(language == .fr ? "Afficher dans la barre des menus" : "Show in the menu bar", isOn: preference("showMenuBarIcon", default: true))
                Toggle(language == .fr ? "Afficher dans le Dock" : "Show in the Dock", isOn: preference("showDockIcon", default: true))
                Text(language == .fr ? "L’icône de la barre des menus permet de rouvrir rapidement le studio. Les deux options sont indépendantes." : "The menu bar icon lets you quickly reopen the studio. These options are independent.").font(.caption).foregroundStyle(.secondary)
            }
            settingsCard(language == .fr ? "Moteurs IA" : "AI engines", icon: "cpu") {
                Text(language == .fr ? "Les moteurs de synthèse, transcription et catégorisation se gèrent dans la section Modèles de la fenêtre principale." : "Manage text-to-speech, speech-to-text and categorization engines in Models in the main window.").font(.callout).foregroundStyle(.secondary)
                Button(language == .fr ? "Ouvrir la fenêtre principale" : "Open the main window") { NSApp.activate(ignoringOtherApps: true) }
            }
            settingsCard(language == .fr ? "Confidentialité" : "Privacy", icon: "lock.shield") {
                Text(language == .fr ? "Les fichiers audio et les modèles restent sur ce Mac. Les providers IA configurés peuvent recevoir les textes d’analyse des livres." : "Audio files and models stay on this Mac. Configured AI providers may receive book analysis text.").font(.callout).foregroundStyle(.secondary)
            }
            Spacer()
        }.padding(28).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func preference(_ key: String, default defaultValue: Bool) -> Binding<Bool> {
        Binding(get: { UserDefaults.standard.object(forKey: key) as? Bool ?? defaultValue }, set: {
            UserDefaults.standard.set($0, forKey: key)
            NotificationCenter.default.post(name: .pkAppPresentationPreferencesChanged, object: nil)
        })
    }

    private var huggingFace: some View {
        VStack(alignment: .leading, spacing: 18) {
            settingsHeader(language == .fr ? "Clé Hugging Face" : "Hugging Face token", language == .fr ? "Nécessaire uniquement pour les modèles protégés." : "Only required for gated models.", icon: "key.horizontal")
            settingsCard(language == .fr ? "Token local" : "Local token", icon: "key") {
                SecureField("hf_…", text: $studio.hfToken).textFieldStyle(.roundedBorder)
                Button(language == .fr ? "Enregistrer" : "Save") { Task { await studio.saveHFToken() } }.buttonStyle(.borderedProminent)
                Text(language == .fr ? "Le token reste sur ce Mac et n’est jamais inclus dans le dépôt." : "The token stays on this Mac and is never included in the repository.").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }.padding(28).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

}

extension Notification.Name {
    static let pkAppPresentationPreferencesChanged = Notification.Name("pkAppPresentationPreferencesChanged")
    static let pkOpenSettings = Notification.Name("pkOpenSettings")
}

private struct PKAboutView: View {
    @ObservedObject private var updater = UpdaterManager.shared
    let language: PKLanguage
    @State private var channel: String = UserDefaults.standard.string(forKey: "updateChannel") ?? "stable"
    private var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—" }
    private var isDev: Bool { version.localizedCaseInsensitiveContains("-dev") }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                VStack(spacing: 0) {
                Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 78, height: 78).clipShape(RoundedRectangle(cornerRadius: 18))
                    .padding(.top, 36).padding(.bottom, 16)
                Text("PK Voice Cloner").font(.system(size: 24, weight: .bold))
                Text("\([PKLanguage.fr: "Version installée", .en: "Installed version", .es: "Versión instalada", .de: "Installierte Version"][language] ?? "Installed version") \(version) (\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—"))")
                    .font(.system(size: 13, weight: .medium, design: .monospaced)).foregroundStyle(.secondary).padding(.top, 4)
                Text(language == .fr ? "Par PK" : "By PK").font(.system(size: 13)).foregroundStyle(.secondary).padding(.top, 2).padding(.bottom, 32)
                aboutCopy.frame(maxWidth: 480).padding(.bottom, 32)
                }
                .frame(maxWidth: .infinity)
                settingsCard(language == .fr ? "Mises à jour" : "Updates", icon: "arrow.triangle.2.circlepath") {
                    Picker(language == .fr ? "Canal" : "Channel", selection: $channel) {
                        Text("Stable").tag("stable")
                        Text("Dev").tag("dev")
                    }
                    .pickerStyle(.segmented)
                    .disabled(isDev)
                    .onChange(of: channel) { _, value in updater.channel = value }
                    Text(channel == "dev"
                         ? (language == .fr ? "Les builds Dev suivent les pushes de la branche principale et s’installent automatiquement. Le flux sera actif après configuration du secret Sparkle dans GitHub Actions." : "Dev builds follow pushes to the main branch and install automatically. The feed becomes active after configuring the Sparkle secret in GitHub Actions.")
                         : (language == .fr ? "Le canal Stable reçoit uniquement les versions validées. Sparkle ne rétrograde pas une version Dev déjà plus récente." : "Stable receives validated releases only. Sparkle will not downgrade a newer Dev build."))
                        .font(.caption).foregroundStyle(.secondary)
                    HStack(spacing: 10) {
                        versionColumn([PKLanguage.fr: "Version stable", .en: "Stable version", .es: "Versión estable", .de: "Stable-Version"][language]!, updater.latestStableVersion ?? ([PKLanguage.fr: "Non publiée", .en: "Not published", .es: "No publicada", .de: "Nicht veröffentlicht"][language]!), status: updater.versionStatus(for: "stable"))
                        versionColumn([PKLanguage.fr: "Version dev", .en: "Dev version", .es: "Versión dev", .de: "Dev-Version"][language]!, updater.latestDevVersion ?? ([PKLanguage.fr: "Non publiée", .en: "Not published", .es: "No publicada", .de: "Nicht veröffentlicht"][language]!), status: updater.versionStatus(for: "dev"))
                    }
                    HStack(spacing: 12) {
                        Spacer()
                        Button {
                            updater.refreshVersions()
                            updater.checkForUpdates()
                        } label: {
                            Label(
                                updateButtonTitle,
                                systemImage: updater.availableUpdateVersion == nil ? "arrow.triangle.2.circlepath" : "arrow.down.circle.fill"
                            )
                        }
                        .buttonStyle(.borderedProminent).disabled(!updater.canCheckForUpdates)
                    }
                }.frame(maxWidth: 480)
            }.padding(.horizontal, 28).padding(.top, 0).frame(maxWidth: 700).frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Divider()
            HStack(spacing: 16) {
                Link(destination: URL(string: "https://github.com/mondary/Macos_PKvoicecloner")!) { Label("GitHub", systemImage: "network") }
                Link(destination: URL(string: "https://github.com/mondary/Macos_PKvoicecloner/issues")!) { Label("Issues", systemImage: "exclamationmark.bubble") }
                Link(destination: URL(string: "https://ko-fi.com/pouark")!) {
                    HStack(spacing: 4) { if let logo = Bundle.main.path(forResource: "kofi-logo", ofType: "png").flatMap(NSImage.init(contentsOfFile:)) { Image(nsImage: logo).resizable().frame(width: 12, height: 12) }; Text(language == .fr ? "Soutenir sur Ko-fi" : "Support on Ko-fi") }
                        .foregroundStyle(Color(red: 1, green: 0.37, blue: 0.36))
                }
                Spacer()
                Text("Apache-2.0 · macOS 14+").foregroundStyle(.tertiary)
            }.font(.caption).padding(.horizontal, 24).padding(.vertical, 14)
        }
        .onAppear {
            if isDev { channel = "dev" }
            updater.refreshVersions()
        }
    }

    private var aboutCopy: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(language == .fr ? "Salut l’ami," : "Hey friend,").italic().font(.system(size: 13))
            Text(language == .fr ? "PK Voice Cloner est né d’une envie simple : créer des narrations avec sa propre voix, sans confier ses enregistrements à un service cloud." : "PK Voice Cloner was born from a simple idea: create narrations in your own voice without handing your recordings to a cloud service.").font(.system(size: 13)).foregroundStyle(.secondary)
            Text(language == .fr ? "Un studio vocal local pour cloner une voix avec consentement, transformer du texte en parole et produire des livres audio. Les modèles et les fichiers audio restent sur ce Mac." : "A local voice studio for consensual voice cloning, text-to-speech and audiobook production. Models and audio files stay on this Mac.").font(.system(size: 13)).foregroundStyle(.secondary)
            Text(language == .fr ? "Conçu avec soin pour celles et ceux qui veulent garder la maîtrise de leur voix et de leurs créations." : "Built with care for everyone who wants to stay in control of their voice and their creations.").font(.system(size: 13)).foregroundStyle(.secondary)
            Text(language == .fr ? "Merci d’en faire partie." : "Thanks for being part of it.").font(.system(size: 13)).foregroundStyle(.secondary).padding(.top, 8)
            Text("— PK").font(.system(size: 13)).foregroundStyle(.secondary)
        }
    }

    private var updateButtonTitle: String {
        guard let available = updater.availableUpdateVersion else {
            return language == .fr ? "Rechercher les mises à jour…" : "Check for Updates…"
        }
        return [PKLanguage.fr: "Installer", .en: "Install", .es: "Instalar", .de: "Installieren"][language]! + " \(available)"
    }

    private func versionColumn(_ title: String, _ value: String, status: PKChannelVersionStatus) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
            Text(value).font(.system(size: 14, weight: .semibold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.75).help(value)
            Label(status.title(language: language), systemImage: status.symbol)
                .font(.system(size: 10, weight: .medium)).foregroundStyle(status.color).lineLimit(1).minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(10)
        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct PKCreditsView: View {
    let language: PKLanguage

    private struct Entry: Identifiable {
        let id: String
        let icon: String
        let title: String
        let author: String
        let use: String
        let license: String?
        let tint: Color
        let url: URL
    }

    private var tools: [Entry] {
        [
            Entry(id: "voxcpm", icon: "waveform", title: "VoxCPM2", author: "OpenBMB", use: language == .fr ? "Clonage vocal local · Apache-2.0" : "Local voice cloning · Apache-2.0", license: "Apache-2.0", tint: .purple, url: URL(string: "https://github.com/OpenBMB/VoxCPM")!),
            Entry(id: "dots", icon: "waveform", title: "dots.tts", author: "dots studio", use: language == .fr ? "Synthèse et clonage vocal · Apache-2.0" : "Speech synthesis and voice cloning · Apache-2.0", license: "Apache-2.0", tint: .blue, url: URL(string: "https://github.com/studio-dots-ai/dots.tts")!),
            Entry(id: "qwen", icon: "text.bubble", title: "Qwen3-TTS", author: "Qwen", use: language == .fr ? "Moteur de synthèse vocale optionnel" : "Optional text-to-speech engine", license: nil, tint: .orange, url: URL(string: "https://github.com/QwenLM/Qwen3-TTS")!),
            Entry(id: "pocket", icon: "waveform", title: "Pocket TTS", author: "Kyutai", use: language == .fr ? "Moteur TTS léger optionnel" : "Optional lightweight TTS engine", license: nil, tint: .teal, url: URL(string: "https://github.com/kyutai-labs/pocket-tts")!),
            Entry(id: "whisper", icon: "text.quote", title: "faster-whisper", author: "SYSTRAN", use: language == .fr ? "Transcription Whisper locale" : "Local Whisper transcription", license: "MIT", tint: .indigo, url: URL(string: "https://github.com/SYSTRAN/faster-whisper")!),
            Entry(id: "parakeet", icon: "waveform.badge.mic", title: "Parakeet Redux + Photon", author: "Moondream", use: language == .fr ? "Moteur de transcription alternatif · poids CC-BY-4.0" : "Alternative transcription engine · CC-BY-4.0 weights", license: "CC-BY-4.0", tint: .cyan, url: URL(string: "https://huggingface.co/moondream/parakeet-redux")!),
            Entry(id: "laya", icon: "tag", title: "Laya", author: "Convai Innovations", use: language == .fr ? "Catégorisation locale des voix et personnages" : "Local voice and character categorization", license: nil, tint: .pink, url: URL(string: "https://huggingface.co/convaiinnovations")!),
            Entry(id: "sparkle", icon: "sparkles", title: "Sparkle", author: "Sparkle project", use: language == .fr ? "Mises à jour de l’app macOS · MIT" : "macOS app updates · MIT", license: "MIT", tint: .yellow, url: URL(string: "https://github.com/sparkle-project/Sparkle")!),
            Entry(id: "threejs", icon: "cube.transparent", title: "Three.js r149", author: "Three.js authors · via ThreeUI Community", use: language == .fr ? "Runtime 3D historique embarqué · MIT" : "Bundled legacy 3D runtime · MIT", license: "MIT", tint: .green, url: URL(string: "https://threejs.org/")!)
        ]
    }

    private var inspirations: [Entry] {
        [
            Entry(id: "elevenlabs", icon: "waveform", title: "ElevenLabs", author: "ElevenLabs", use: language == .fr ? "Inspiration pour l’interface du studio vocal" : "Voice-studio interface inspiration", license: nil, tint: .orange, url: URL(string: "https://elevenlabs.io/")!),
            Entry(id: "threeui", icon: "square.stack.3d.up", title: "ThreeUI Community", author: "Meng To", use: language == .fr ? "Source historique du runtime Three.js et inspiration de composants" : "Historical source of the Three.js runtime and component inspiration", license: "MIT", tint: .blue, url: URL(string: "https://github.com/MengTo/threeui")!)
        ]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                VStack(spacing: 8) {
                    Image(systemName: "text.book.closed.fill").font(.system(size: 36, weight: .medium)).foregroundStyle(Color.accentColor)
                    Text(language == .fr ? "Crédits & inspirations" : "Credits & inspirations").font(.system(size: 20, weight: .bold))
                    Text(language == .fr ? "Les outils réellement utilisés, séparés des références d’inspiration." : "Tools actually used, kept separate from interface inspirations.")
                        .font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                .padding(.top, 36).padding(.bottom, 4)

                creditGroup(title: language == .fr ? "Outils, modèles et dépendances" : "Tools, models and dependencies", entries: tools)
                creditGroup(title: language == .fr ? "Inspirations" : "Inspirations", entries: inspirations)
                Text(language == .fr ? "PK Voice Cloner est un projet indépendant. Les crédits ne constituent pas un inventaire juridique exhaustif." : "PK Voice Cloner is an independent project. These credits are not an exhaustive legal notice.")
                    .font(.caption).foregroundStyle(.secondary).frame(maxWidth: 520, alignment: .leading)
            }
            .padding(.horizontal, 28).padding(.bottom, 32)
            .frame(maxWidth: 576).frame(maxWidth: .infinity)
        }
    }

    private func creditGroup(title: String, entries: [Entry]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.system(size: 13, weight: .semibold))
            VStack(spacing: 0) {
                ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                    if index > 0 { Divider().padding(.leading, 58) }
                    Link(destination: entry.url) {
                        HStack(spacing: 12) {
                            Image(systemName: entry.icon).font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(entry.tint).frame(width: 36, height: 36)
                                .background(entry.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(entry.title).font(.system(size: 12, weight: .semibold))
                                    if let license = entry.license {
                                        Text(license).font(.system(size: 9, weight: .medium, design: .monospaced)).foregroundStyle(.secondary)
                                            .padding(.horizontal, 5).padding(.vertical, 2).background(Color.primary.opacity(0.06), in: Capsule())
                                    }
                                }
                                Text(entry.author).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                                Text(entry.use).font(.system(size: 11)).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "arrow.up.right").font(.system(size: 10)).foregroundStyle(.tertiary)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .frame(maxWidth: 520, alignment: .leading)
    }
}

private struct PKProjectLibraryView: View {
    let language: PKLanguage
    private struct Project: Identifiable {
        let id: String; let title: String; let icon: String; let descriptionFR: String; let descriptionEN: String; let tint: NSColor; var screenshot: String? = nil
        var description: String { languageValue(descriptionFR, descriptionEN) }
        var url: URL { URL(string: "https://github.com/mondary/\(id)")! }
    }
    private var projects: [Project] { [
        Project(id: "Macos_PKvoicecloner", title: "PK Voice Cloner", icon: "PKVoiceCloner", descriptionFR: "Studio vocal local : clonage de voix avec consentement, synthèse vocale et narration de livres audio.", descriptionEN: "Local voice studio for consensual voice cloning, speech synthesis and audiobook narration.", tint: NSColor(hex: "#8B5CF6")!),
        Project(id: "PKmonitor", title: "PKMonitor", icon: "PKmonitor", descriptionFR: "Une ligne discrète dans la barre de menus pour garder un œil sur les ressources du Mac.", descriptionEN: "A quiet menu bar line to keep an eye on your Mac’s resources.", tint: NSColor(hex: "#0EA5E9")!, screenshot: "PKmonitor"),
        Project(id: "PKwindowsManagement", title: "PKwindowsManagement", icon: "PKwindowsManagement", descriptionFR: "Gestion des fenêtres, espaces et outils de productivité macOS.", descriptionEN: "Window, workspace and macOS productivity management.", tint: NSColor(hex: "#F97316")!),
        Project(id: "PKbrain", title: "PKbrain", icon: "PKbrain", descriptionFR: "Prise de notes native, rapide et privée.", descriptionEN: "Fast, private native note-taking.", tint: NSColor(hex: "#6366F1")!),
        Project(id: "monocode", title: "MonoCode PK", icon: "MonoCodePK", descriptionFR: "Une interface graphique pour piloter les agents de développement.", descriptionEN: "A GUI for your coding agents.", tint: NSColor(hex: "#22D3EE")!),
        Project(id: "media-downloader", title: "PKMediaDownloader", icon: "PKMediaDownloader", descriptionFR: "Télécharger et découper des vidéos dans une app macOS native.", descriptionEN: "Download and trim videos in a native macOS app.", tint: NSColor(hex: "#F43F5E")!),
        Project(id: "Macos_PKarchives", title: "PKarchives", icon: "PKarchives", descriptionFR: "Archives de projets et restauration de versions.", descriptionEN: "Project archives and version restoration.", tint: NSColor(hex: "#8B5CF6")!, screenshot: "PKarchives"),
        Project(id: "Macos_PKpowerlines", title: "PKpowerlines", icon: "PKpowerlines", descriptionFR: "Indicateurs visuels et raccourcis pour macOS.", descriptionEN: "Visual indicators and shortcuts for macOS.", tint: NSColor(hex: "#10B981")!, screenshot: "PKpowerlines"),
        Project(id: "PKmac-cleanup", title: "LaunchPad", icon: "PKmac-cleanup", descriptionFR: "Un Launchpad personnalisable pour Mac.", descriptionEN: "A customizable Launchpad for Mac.", tint: NSColor(hex: "#EC4899")!),
        Project(id: "Chrome_SimpleGMAIL", title: "PKMail", icon: "PKMail", descriptionFR: "Une interface Gmail épurée et légère.", descriptionEN: "An uncluttered, lightweight Gmail interface.", tint: NSColor(hex: "#EA4335")!),
        Project(id: "Chrome_PKshortcuts", title: "PK Chrome Shortcuts", icon: "PKshortcuts", descriptionFR: "Raccourcis clavier pratiques pour Chrome.", descriptionEN: "Useful keyboard shortcuts for Chrome.", tint: NSColor(hex: "#F59E0B")!)
    ] }
    private var featured: Project { projects[0] }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                settingsHeader(
                    [PKLanguage.fr: "Bibliothèque de projets", .en: "Project Library", .es: "Biblioteca de proyectos", .de: "Projektbibliothek"][language] ?? "Project Library",
                    language == .fr ? "Découvrez les autres outils et projets que je construis." : "Discover the other tools and projects I build.",
                    icon: "square.grid.2x2"
                )
                featuredCard(featured)
                Text(language == .fr ? "Plus de projets" : "More projects").font(.system(size: 18, weight: .bold, design: .rounded)).padding(.top, 4)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
                    ForEach(projects.dropFirst()) { project in projectCard(project) }
                }
                Link(destination: URL(string: "https://github.com/mondary")!) { Label(language == .fr ? "Voir tous les dépôts sur GitHub" : "View all repositories on GitHub", systemImage: "arrow.up.right.square") }.buttonStyle(.borderedProminent).padding(.top, 6)
            }.padding(28).frame(maxWidth: 860).frame(maxWidth: .infinity)
        }
    }

    private func asset(_ name: String) -> NSImage? {
        guard let path = Bundle.main.path(forResource: name, ofType: "png", inDirectory: "ProjectIcons") else { return nil }
        return NSImage(contentsOfFile: path)
    }
    private func screenshot(_ name: String?) -> NSImage? {
        guard let name, let path = Bundle.main.path(forResource: name, ofType: "png", inDirectory: "ProjectScreenshots") else { return nil }
        return NSImage(contentsOfFile: path)
    }
    private func featuredCard(_ project: Project) -> some View {
        Link(destination: project.url) {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        icon(project, size: 56, radius: 14)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(project.title).font(.system(size: 24, weight: .bold, design: .rounded))
                            Text(language == .fr ? "APP MACOS" : "MACOS APP").font(.system(size: 10, weight: .bold)).foregroundStyle(Color(nsColor: project.tint))
                        }
                    }
                    Text(project.description).font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).lineLimit(3)
                    Label(language == .fr ? "Étoiler sur GitHub" : "Star on GitHub", systemImage: "star.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white).padding(.horizontal, 12).padding(.vertical, 7).background(Color.accentColor, in: Capsule())
                }.padding(22).frame(maxWidth: 340, alignment: .topLeading)
                if let image = screenshot(project.screenshot) {
                    GeometryReader { geo in Image(nsImage: image).resizable().interpolation(.high).scaledToFill().frame(width: geo.size.width, height: geo.size.height).clipped() }
                        .frame(maxWidth: .infinity, maxHeight: .infinity).overlay(alignment: .leading) { LinearGradient(colors: [Color(nsColor: .controlBackgroundColor), .clear], startPoint: .leading, endPoint: .trailing).frame(width: 60) }
                } else {
                    ZStack {
                        LinearGradient(colors: [Color(nsColor: project.tint).opacity(0.72), Color(nsColor: project.tint).opacity(0.28)], startPoint: .topLeading, endPoint: .bottomTrailing)
                        icon(project, size: 116, radius: 26).shadow(color: .black.opacity(0.22), radius: 12, y: 5)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }.frame(height: 210).background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(Color(nsColor: .separatorColor).opacity(0.55), lineWidth: 0.5)).clipShape(RoundedRectangle(cornerRadius: 18))
        }.buttonStyle(.plain)
    }
    private func projectCard(_ project: Project) -> some View {
        Link(destination: project.url) {
            VStack(alignment: .leading, spacing: 0) {
                Group {
                    if let shot = screenshot(project.screenshot) { Image(nsImage: shot).resizable().interpolation(.high).scaledToFill().frame(height: 150).clipped() }
                    else { ZStack { LinearGradient(colors: [Color(nsColor: project.tint).opacity(0.75), Color(nsColor: project.tint).opacity(0.35)], startPoint: .topLeading, endPoint: .bottomTrailing); icon(project, size: 74, radius: 16).shadow(color: .black.opacity(0.25), radius: 8, y: 3) } }
                }.frame(height: 150).frame(maxWidth: .infinity).clipped()
                HStack(alignment: .top, spacing: 10) {
                    icon(project, size: 30, radius: 8)
                    VStack(alignment: .leading, spacing: 3) { Text(project.title).font(.system(size: 14, weight: .semibold)); Text(project.description).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(2) }
                    Spacer(minLength: 8); Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(.tertiary)
                }.padding(14)
            }.background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 15)).overlay(RoundedRectangle(cornerRadius: 15).stroke(Color(nsColor: .separatorColor).opacity(0.55), lineWidth: 0.5)).clipShape(RoundedRectangle(cornerRadius: 15))
        }.buttonStyle(.plain)
    }
    @ViewBuilder private func icon(_ project: Project, size: CGFloat, radius: CGFloat) -> some View {
        if let image = asset(project.icon) { Image(nsImage: image).resizable().interpolation(.high).scaledToFit().frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: radius)) }
        else { Image(nsImage: NSApp.applicationIconImage).resizable().scaledToFit().frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: radius)) }
    }
}

private struct PKSupportView: View {
    let language: PKLanguage
    private var logo: NSImage? { Bundle.main.path(forResource: "kofi-logo", ofType: "png").flatMap(NSImage.init(contentsOfFile:)) }
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 8) {
                    Image(systemName: "heart.fill").font(.system(size: 36)).foregroundStyle(.red)
                    Text(language == .fr ? "Soutenir PK Voice Cloner" : "Support PK Voice Cloner").font(.system(size: 20, weight: .bold))
                    Text(language == .fr ? "Si cette application vous plaît, pensez à soutenir son développement." : "If you enjoy using this app, consider supporting its development.").font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }.padding(.top, 36).padding(.bottom, 24)
                VStack(spacing: 16) {
                    HStack(spacing: 12) {
                        Group { if let logo { Image(nsImage: logo).resizable().interpolation(.high) } else { Image(systemName: "cup.and.saucer.fill").font(.system(size: 22)) } }.frame(width: 28, height: 28).frame(width: 36)
                        VStack(alignment: .leading, spacing: 2) { Text("Ko-fi").font(.system(size: 14, weight: .semibold)); Text(language == .fr ? "Offrir un café au développeur" : "Support the developer with a coffee").font(.system(size: 12)).foregroundStyle(.secondary) }
                        Spacer()
                        Link(destination: URL(string: "https://ko-fi.com/pouark")!) { Text(language == .fr ? "Soutenir sur Ko-fi" : "Support on Ko-fi").font(.system(size: 13, weight: .medium)).foregroundStyle(.white).padding(.horizontal, 16).padding(.vertical, 6).background(Color(red: 1, green: 0.37, blue: 0.36)).clipShape(RoundedRectangle(cornerRadius: 8)) }.buttonStyle(.plain)
                    }.padding(16).background(Color(nsColor: .controlBackgroundColor)).clipShape(RoundedRectangle(cornerRadius: 12))
                    VStack(spacing: 0) {
                        supportLink(icon: "network", title: "GitHub", subtitle: language == .fr ? "Code source et versions" : "Source code and releases", url: "https://github.com/mondary/Macos_PKvoicecloner")
                        Divider().padding(.leading, 52)
                        supportLink(icon: "exclamationmark.bubble", title: language == .fr ? "Signaler un problème" : "Report an Issue", subtitle: language == .fr ? "Bugs, demandes de fonctionnalités, retours" : "Bugs, feature requests, feedback", url: "https://github.com/mondary/Macos_PKvoicecloner/issues")
                        Divider().padding(.leading, 52)
                        supportLink(icon: "person.crop.circle", title: language == .fr ? "PK sur GitHub" : "PK on GitHub", subtitle: language == .fr ? "Le reste de la collection de projets" : "The rest of the project collection", url: "https://github.com/mondary")
                    }.background(Color(nsColor: .controlBackgroundColor)).clipShape(RoundedRectangle(cornerRadius: 12))
                }.frame(maxWidth: 480).padding(.bottom, 32)
            }.frame(maxWidth: .infinity)
        }
    }
    private func supportLink(icon: String, title: String, subtitle: String, url: String) -> some View {
        Link(destination: URL(string: url)!) { HStack(spacing: 12) { Image(systemName: icon).font(.system(size: 16)).foregroundStyle(.secondary).frame(width: 36); VStack(alignment: .leading, spacing: 2) { Text(title).font(.system(size: 13, weight: .medium)); Text(subtitle).font(.system(size: 11)).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "arrow.up.right").font(.system(size: 11)).foregroundStyle(.tertiary) }.padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle()) }.buttonStyle(.plain)
    }
}

private func languageValue(_ fr: String, _ en: String) -> String { PKLanguage.current == .fr ? fr : en }

private extension NSColor {
    convenience init?(hex: String) {
        guard let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) else { return nil }
        self.init(srgbRed: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
    }
}

private func settingsHeader(_ title: String, _ subtitle: String, icon: String) -> some View {
    HStack(spacing: 12) {
        Image(systemName: icon).font(.system(size: 20)).frame(width: 42, height: 42).background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        VStack(alignment: .leading, spacing: 3) { Text(title).font(.system(size: 21, weight: .bold)); Text(subtitle).font(.caption).foregroundStyle(.secondary) }
        Spacer()
    }.padding(.bottom, 4)
}

private func settingsCard<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 12) {
        Label(title, systemImage: icon).font(.headline)
        content()
    }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(nsColor: .separatorColor).opacity(0.6), lineWidth: 0.5))
}
