import SwiftUI
import AppKit
import WebKit

private enum Dashboard {
    static let ink = Color(red: 0.035, green: 0.035, blue: 0.043)
    static let muted = Color(red: 0.443, green: 0.443, blue: 0.478)
    static let line = Color(red: 0.894, green: 0.894, blue: 0.906)
    static let soft = Color(red: 0.957, green: 0.957, blue: 0.961)
}

struct ContentView: View {
    @ObservedObject var studio: Studio
    @Environment(\.openWindow) private var openWindow
    @State private var renamePath: String?
    @State private var renameValue = ""
    @State private var deletePath: String?
    @State private var deleteName = ""
    @State private var section = "Vue d’ensemble"
    @State private var settingsSection: PKSettingsSection = .general
    private let sections = [("Vue d’ensemble", "square.grid.2x2"), ("Bibliothèque de voix", "waveform"), ("Texte vers voix", "text.justify"), ("Livres", "books.vertical"), ("Modèles", "cpu")]

    var body: some View {
        Group {
        if section == "Réglages" {
            SettingsWindowView(studio: studio, onBack: { section = "Vue d’ensemble" }, initialSection: settingsSection)
                .frame(minWidth: 980, minHeight: 650)
        } else {
        HStack(spacing: 0) {
            sidebar
            Rectangle().fill(Dashboard.line).frame(width: 1)
            VStack(spacing: 0) {
                topbar
                Rectangle().fill(Dashboard.line).frame(height: 1)
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        heading
                        if let error = studio.error ?? studio.state?.erreur {
                            VStack(alignment: .leading, spacing: 8) {
                                Label(error, systemImage: "exclamationmark.triangle").textSelection(.enabled)
                                HStack {
                                    Button("Voir le journal") { studio.openLog() }
                                    if let engine = studio.state?.moteur,
                                       let model = studio.models.first(where: { $0.moteur == engine }) {
                                        Button(model.installe ? "Activer \(model.label)" : "Installer \(model.label)") { Task { await studio.install(model) } }
                                    }
                                    if studio.error != nil { Button("Masquer") { studio.error = nil } }
                                }
                            }.font(.system(size: 12)).foregroundStyle(.red).padding(14).frame(maxWidth: .infinity, alignment: .leading).dashboardPanel()
                        }
                        if studio.busy { ProgressView("Opération en cours…").font(.caption) }
                        if let engine = studio.loadingEngine {
                            loadingDrawer(engine: engine)
                        }
                        if section == "Vue d’ensemble" {
                            overview
                } else if studio.state == nil {
                            welcome
                        } else if section == "Bibliothèque de voix" {
                            voices
                        } else if section == "Texte vers voix" {
                            VStack(alignment: .leading, spacing: 16) { editor; prises }
                        } else if section == "Livres" {
                            livres
                        } else if section == "Modèles" {
                            models
                        }
                        HStack(alignment: .center, spacing: 6) {
                            Image(systemName: "lock.fill")
                            Text("AUCUN AUDIO ENVOYÉ DANS LE CLOUD")
                        }.font(.system(size: 9, design: .monospaced)).foregroundStyle(Dashboard.muted).padding(.top, 4)
                    }.padding(28).frame(maxWidth: 1360)
                }
            }
        }
        .background(.white).foregroundStyle(Dashboard.ink)
        .frame(minWidth: 920, minHeight: 650)
        .preferredColorScheme(.light)
        }
        }
        .task { await studio.boot() }
        .onReceive(NotificationCenter.default.publisher(for: .pkOpenSettings)) { notification in
            settingsSection = notification.userInfo?["section"] as? PKSettingsSection ?? .general
            section = "Réglages"
        }
        .sheet(isPresented: Binding(get: { renamePath != nil }, set: { if !$0 { renamePath = nil } })) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Renommer").font(.headline)
                TextField("Nom", text: $renameValue).textFieldStyle(.roundedBorder)
                HStack {
                    Button("Annuler") { renamePath = nil }.keyboardShortcut(.cancelAction)
                    Spacer()
                    Button("Enregistrer") {
                        let path = renamePath!; let name = renameValue
                        renamePath = nil
                        Task { await studio.rename(path, name: name) }
                    }.keyboardShortcut(.defaultAction).disabled(renameValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }.padding(24).frame(width: 350)
        }
        .alert("Supprimer « \(deleteName) » ?", isPresented: Binding(get: { deletePath != nil }, set: { if !$0 { deletePath = nil } })) {
            Button("Annuler", role: .cancel) { deletePath = nil }
            Button("Supprimer", role: .destructive) {
                if let path = deletePath { Task { await studio.delete(path) } }
                deletePath = nil
            }
        } message: { Text("Les fichiers locaux correspondants seront supprimés.") }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text("pk").font(.system(size: 13, weight: .bold)).frame(width: 28, height: 28)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Dashboard.ink, lineWidth: 1.5))
                Text("Voice Studio").font(.system(size: 17, weight: .semibold))
            }.padding(.horizontal, 12).padding(.top, 25).padding(.bottom, 36)
            Text("Espace de travail").font(.system(size: 11)).foregroundStyle(Dashboard.muted).padding(.horizontal, 12).padding(.bottom, 10)
            ForEach(sections, id: \.0) { item in
                Button { section = item.0 } label: {
                    HStack(spacing: 11) {
                        Image(systemName: item.1).frame(width: 16).foregroundStyle(Dashboard.muted)
                        Text(item.0).font(.system(size: 12, weight: section == item.0 ? .semibold : .regular))
                        Spacer()
                    }.padding(.horizontal, 12).padding(.vertical, 10)
                        .background(section == item.0 ? Dashboard.soft : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }.buttonStyle(.plain).padding(.bottom, 3)
            }
            Spacer()
            Button { section = "Réglages" } label: {
                HStack(spacing: 11) {
                    Image(systemName: "gearshape").frame(width: 16).foregroundStyle(Dashboard.muted)
                    Text("Réglages").font(.system(size: 12, weight: section == "Réglages" ? .semibold : .regular))
                    Spacer()
                }.padding(.horizontal, 12).padding(.vertical, 10)
                    .background(section == "Réglages" ? Dashboard.soft : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .contentShape(Rectangle())
            }.buttonStyle(.plain).help("Ouvrir les réglages")
            Divider().padding(.vertical, 12)
            HStack(spacing: 10) {
                Text("PK").font(.system(size: 10)).foregroundStyle(.white).frame(width: 30, height: 30).background(Dashboard.ink).clipShape(Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text("Studio personnel").font(.system(size: 12, weight: .medium))
                    Text("Sur ce Mac · 100 % local").font(.system(size: 10)).foregroundStyle(Dashboard.muted)
                }
            }.padding(.horizontal, 10).padding(.bottom, 20)
        }.padding(.horizontal, 12).frame(width: 220)
    }

    private var topbar: some View {
        HStack(spacing: 12) {
            Text("Espace de travail").foregroundStyle(Dashboard.muted)
            Text("/").foregroundStyle(Dashboard.muted)
            Text(section)
            Spacer()
            HStack(spacing: 4) {
                Text("APP \(studio.appVersion)").foregroundStyle(studio.ecartVersion == nil ? Dashboard.muted : .orange)
                Text("·").foregroundStyle(Dashboard.muted)
                Text("SERVEUR \(studio.state?.version ?? "—")")
                    .foregroundStyle(studio.ecartVersion == nil ? Dashboard.muted : .orange)
            }
            .font(.system(size: 9, design: .monospaced))
            .lineLimit(1)
            .help(studio.ecartVersion == nil
                ? "Versions de l’app et du serveur local."
                : "Versions différentes : APP \(studio.appVersion) · SERVEUR \(studio.ecartVersion ?? "—"). Reconstruis l’app pour les synchroniser.")
            Circle().fill(studio.state == nil ? Dashboard.muted : Color.green).frame(width: 6, height: 6)
            Text(studio.message).foregroundStyle(Dashboard.muted).lineLimit(1)
            Button("Ouvrir le studio web", systemImage: "book") { openWindow(id: "book-studio") }
                .buttonStyle(.bordered)
                .disabled(studio.state == nil)
                .help(studio.state == nil ? "Démarre le serveur local pour ouvrir le studio web." : "Ouvre le studio web complet dans ton navigateur.")
            if studio.state == nil {
                Button(studio.powerBusy ? "Patiente…" : "Démarrer", systemImage: "power") { Task { await studio.toggle() } }
                    .buttonStyle(.borderedProminent).tint(Dashboard.ink)
                    .disabled(studio.powerBusy || studio.busy || studio.generating || studio.recording)
            } else {
                Button(studio.powerBusy ? "Patiente…" : "Éteindre", systemImage: "power") { Task { await studio.toggle() } }
                    .buttonStyle(.bordered).tint(Dashboard.ink)
                    .disabled(studio.powerBusy || studio.busy || studio.generating || studio.recording)
            }
        }.font(.system(size: 11)).padding(.horizontal, 28).frame(height: 60)
    }

    /// Écran d'accueil quand le serveur local est éteint : rien n'est utilisable,
    /// alors on l'explique et on propose un démarrage impossible à manquer.
    private var welcome: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Le studio est éteint").font(.system(size: 27, weight: .semibold)).tracking(-0.8)
            Text("Bibliothèque de voix, textes et modèles ont besoin du serveur local : il démarre le moteur vocal Python sur ce Mac, sans envoyer quoi que ce soit sur le réseau.")
                .font(.system(size: 12)).foregroundStyle(Dashboard.muted).frame(maxWidth: 560, alignment: .leading)
            HStack(spacing: 12) {
                Button(studio.powerBusy ? "Démarrage du studio…" : "Démarrer le studio") { Task { await studio.toggle() } }
                    .buttonStyle(.borderedProminent).tint(Dashboard.ink).controlSize(.large)
                    .disabled(studio.powerBusy)
                Button("Voir le journal") { studio.openLog() }
                    .buttonStyle(.bordered).controlSize(.large).disabled(studio.powerBusy)
            }
            Text(studio.state == nil && studio.powerBusy ? "Le serveur démarre, puis le moteur se charge (~1-2 min la première fois)." : "Astuce : le studio démarre aussi tout seul à l’ouverture de l’app.")
                .font(.system(size: 10)).foregroundStyle(Dashboard.muted)
        }.padding(28).frame(maxWidth: .infinity, alignment: .leading).dashboardPanel()
    }

    private func loadingDrawer(engine: String) -> some View {
        let label = ["voxcpm2": "VoxCPM2", "dots": "dots.tts", "qwen3": "Qwen3-TTS", "pocket": "Pocket TTS"][engine] ?? engine
        return HStack(alignment: .top, spacing: 12) {
            ProgressView().controlSize(.small)
            VStack(alignment: .leading, spacing: 4) {
                Text("Chargement de \(label)").font(.system(size: 13, weight: .semibold))
                Text("Le modèle est préparé en mémoire. Tu peux attendre ou annuler pour choisir un autre moteur.")
                    .font(.system(size: 11)).foregroundStyle(Dashboard.muted)
            }
            Spacer()
            Button("Annuler le chargement") { Task { await studio.cancelLoading() } }
                .buttonStyle(.bordered).font(.system(size: 11)).disabled(studio.busy)
        }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(Dashboard.soft).clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Dashboard.line, lineWidth: 1))
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("TON ESPACE DE CRÉATION").font(.system(size: 9, design: .monospaced)).tracking(1.5).foregroundStyle(Dashboard.muted)
            Text(section == "Vue d’ensemble" ? "Le studio vocal." : section).font(.system(size: 27, weight: .semibold)).tracking(-0.8)
            Text("Tes voix, tes mots. Crée un nouvel audio, entièrement sur ce Mac.").font(.system(size: 12)).foregroundStyle(Dashboard.muted)
        }.padding(.bottom, 6)
    }

    private var overview: some View {
        VStack(alignment: .leading, spacing: 16) {
            stats
            HStack(alignment: .top, spacing: 16) {
                diagnostics.frame(maxWidth: .infinity, alignment: .topLeading)
                recentActivity.frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
    }

    private var stats: some View {
        HStack(spacing: 0) {
            stat("Voix enregistrées", value: studio.state == nil ? "—" : "\(studio.voices.count)", detail: "Dans ta bibliothèque", icon: "waveform")
            Rectangle().fill(Dashboard.line).frame(width: 1)
            stat("Modèles installés", value: studio.state == nil ? "—" : "\(studio.models.filter { $0.installe }.count)", detail: "Disponibles sur ce Mac", icon: "cpu")
            Rectangle().fill(Dashboard.line).frame(width: 1)
            stat("Livres préparés", value: studio.state == nil ? "—" : "\(studio.books.count)", detail: "EPUB dans le studio web", icon: "books.vertical")
            Rectangle().fill(Dashboard.line).frame(width: 1)
            stat("Confidentialité", value: "100 %", detail: "Traitement sur ce Mac", icon: "lock")
        }.fixedSize(horizontal: false, vertical: true).dashboardPanel()
    }

    private var diagnostics: some View {
        VStack(alignment: .leading, spacing: 14) {
            panelTitle("État du studio", subtitle: "Démarrage, moteur et dépannage")
            HStack(spacing: 8) {
                Circle().fill(studio.state == nil ? Dashboard.muted : studio.state?.erreur == nil ? Color.green : .orange)
                    .frame(width: 7, height: 7)
                VStack(alignment: .leading, spacing: 3) {
                    Text(studio.state == nil ? "Serveur arrêté" : studio.state?.erreur == nil ? studio.message : "Moteur indisponible")
                        .font(.system(size: 12, weight: .medium))
                    if let moteur = studio.state?.moteur {
                        Text("Moteur : \(studio.models.first(where: { $0.moteur == moteur })?.label ?? moteur)")
                            .font(.system(size: 10)).foregroundStyle(Dashboard.muted)
                    }
                }
                Spacer()
                if studio.state == nil {
                    Button("Démarrer", systemImage: "power") { Task { await studio.toggle() } }
                        .buttonStyle(.borderedProminent).tint(Dashboard.ink).disabled(studio.powerBusy)
                } else if studio.state?.modele != true,
                          let moteur = studio.state?.moteur,
                          let model = studio.models.first(where: { $0.moteur == moteur }) {
                    Button(model.installe ? "Activer le moteur" : "Installer le moteur") {
                        Task { await studio.install(model) }
                    }.buttonStyle(.borderedProminent).tint(Dashboard.ink).disabled(controlsLocked)
                }
            }.padding(12).background(Dashboard.soft).clipShape(RoundedRectangle(cornerRadius: 6))

            HStack(spacing: 8) {
                Button("Voir le journal", systemImage: "doc.text.magnifyingglass") { studio.openLog() }
                    .buttonStyle(.bordered).disabled(studio.root == nil)
                Button("Ouvrir le studio web", systemImage: "book") { openWindow(id: "book-studio") }
                    .buttonStyle(.bordered).disabled(studio.state == nil)
            }.font(.system(size: 11))

            Menu {
                ForEach(studio.voices) { voice in
                    Button(voice.nom, systemImage: studio.selectedVoiceID == voice.id ? "checkmark.circle.fill" : "waveform") {
                        Task { await studio.selectVoice(voice) }
                    }
                }
            } label: {
                Label(studio.voices.first(where: { $0.id == studio.selectedVoiceID }).map { "Voix active : \($0.nom)" } ?? "Choisir une voix", systemImage: "waveform")
                    .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            }
            .menuStyle(.borderlessButton)
            .disabled(studio.voices.isEmpty || controlsLocked)

            if let missing = studio.models.first(where: { !$0.installe && $0.etat != "en_cours" }) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Modèle optionnel à installer").font(.system(size: 11, weight: .medium))
                        Text("\(missing.label) · \(missing.taille)").font(.system(size: 10)).foregroundStyle(Dashboard.muted)
                    }
                    Spacer()
                    Button("Installer") { Task { await studio.install(missing) } }
                        .buttonStyle(.bordered).disabled(controlsLocked)
                }
            }
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).dashboardPanel()
    }

    private var recentActivity: some View {
        VStack(alignment: .leading, spacing: 14) {
            panelTitle("Activité récente", subtitle: "Livres importés et dernières prises générées")

            Text("DERNIERS LIVRES EPUB").font(.system(size: 9, weight: .medium, design: .monospaced))
                .tracking(0.6).foregroundStyle(Dashboard.muted)
            if studio.books.isEmpty {
                Text(studio.state == nil ? "Démarre le studio pour voir tes livres." : "Aucun livre préparé pour le moment.")
                    .font(.system(size: 11)).foregroundStyle(Dashboard.muted)
            } else {
                ForEach(studio.books.prefix(3)) { book in
                    HStack(spacing: 8) {
                        Image(systemName: "book.closed").foregroundStyle(Dashboard.muted)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(book.titre).font(.system(size: 11, weight: .medium)).lineLimit(1)
                            Text("\(book.chapitres.count) chapitres · \(book.mots.formatted()) mots")
                                .font(.system(size: 10)).foregroundStyle(Dashboard.muted)
                        }
                        Spacer(minLength: 4)
                        Button { openWindow(id: "book-studio") } label: { Image(systemName: "book") }
                            .buttonStyle(.borderless).help("Ouvrir les livres dans PK Voice Studio")
                    }.padding(.vertical, 3)
                }
            }

            Divider()
            Text("DERNIÈRES PRISES").font(.system(size: 9, weight: .medium, design: .monospaced))
                .tracking(0.6).foregroundStyle(Dashboard.muted)
            if studio.audios.isEmpty {
                Text("Aucune prise générée pour le moment.").font(.system(size: 11)).foregroundStyle(Dashboard.muted)
            } else {
                ForEach(studio.audios.prefix(3)) { audio in
                    HStack(spacing: 8) {
                        Image(systemName: "waveform").foregroundStyle(Dashboard.muted)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(audio.nom).font(.system(size: 11, weight: .medium)).lineLimit(1)
                            Text("\(Int(audio.duree)) s · \(audio.transcript.isEmpty ? "Transcript absent" : String(audio.transcript.prefix(75)))")
                                .font(.system(size: 10)).foregroundStyle(Dashboard.muted).lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        Button { Task { await studio.play(studio.baseURL.appendingPathComponent("api/audio/\(audio.nom)")) } }
                            label: { Image(systemName: "play.fill") }
                            .buttonStyle(.borderless).help("Écouter cette prise")
                    }.padding(.vertical, 3)
                }
            }
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).dashboardPanel()
    }

    private func stat(_ title: String, value: String, detail: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack { Text(title); Spacer(); Image(systemName: icon) }.font(.system(size: 11)).foregroundStyle(Dashboard.muted)
            Text(value).font(.system(size: 26, weight: .semibold)).monospacedDigit()
            Text(detail).font(.system(size: 10)).foregroundStyle(Dashboard.muted)
        }.padding(17).frame(maxWidth: .infinity, alignment: .leading)
    }

    private var controlsLocked: Bool { studio.state == nil || studio.busy || studio.generating || studio.recording || studio.powerBusy }

    private var voices: some View {
        VStack(alignment: .leading, spacing: 14) {
            panelTitle("Bibliothèque de voix", subtitle: "Sélectionne une référence pour la génération")
            HStack {
                Button("Importer", systemImage: "square.and.arrow.down") { studio.chooseAudio() }.disabled(controlsLocked)
                Button(studio.recording ? "Arrêter · \(studio.recordingSeconds) s" : "Enregistrer", systemImage: studio.recording ? "stop.circle.fill" : "mic") {
                    Task { await studio.toggleRecording() }
                }.disabled(studio.state == nil || studio.busy || studio.generating || studio.powerBusy)
            }.buttonStyle(.bordered).font(.system(size: 11))
            if studio.voices.isEmpty {
                Text(studio.state == nil ? "Démarre le studio pour retrouver tes voix." : "Importe un fichier audio ou enregistre une première référence.")
                    .font(.system(size: 12)).foregroundStyle(Dashboard.muted).frame(maxWidth: .infinity, minHeight: 100)
            }
            ForEach(studio.voices) { voice in
                HStack(spacing: 8) {
                    Button { Task { await studio.selectVoice(voice) } } label: {
                        HStack {
                            Image(systemName: studio.selectedVoiceID == voice.id ? "checkmark.circle.fill" : "waveform")
                            Text(voice.nom).lineLimit(1)
                            Spacer()
                            if let duration = voice.duree { Text("\(Int(duration)) s").foregroundStyle(Dashboard.muted) }
                        }.contentShape(Rectangle())
                    }.buttonStyle(.plain).disabled(controlsLocked)
                    Button { Task { await studio.play(studio.baseURL.appendingPathComponent("api/voix/\(voice.id)/wav"), voiceID: voice.id) } } label: {
                        Image(systemName: studio.playing && studio.playingVoiceID == voice.id ? "stop.fill" : "play.fill")
                    }.help("Écouter \(voice.nom)").disabled(studio.busy || studio.recording || studio.state == nil)
                    Menu {
                        Button("Renommer") { renameValue = voice.nom; renamePath = "api/voix/\(voice.id)" }
                        Button("Supprimer", role: .destructive) { deleteName = voice.nom; deletePath = "api/voix/\(voice.id)" }
                    } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).frame(width: 20).disabled(controlsLocked)
                }.font(.system(size: 12)).padding(8)
                    .background(studio.selectedVoiceID == voice.id ? Dashboard.soft : .clear).clipShape(RoundedRectangle(cornerRadius: 5))
            }
            if studio.selectedVoiceID != nil {
                DisclosureGroup("Transcript de référence") {
                    TextEditor(text: $studio.transcript).font(.system(size: 12)).frame(height: 85).disabled(controlsLocked)
                }.font(.system(size: 11)).foregroundStyle(Dashboard.muted)
            }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading).dashboardPanel()
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 14) {
            panelTitle("Texte → Voix", subtitle: studio.voices.first(where: { $0.id == studio.selectedVoiceID }).map { "Voix : \($0.nom)" } ?? "Sélectionne d’abord une voix dans la bibliothèque")
            TextEditor(text: $studio.text).font(.system(size: 14)).scrollContentBackground(.hidden)
                .padding(8).frame(minHeight: 170).background(Dashboard.soft.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 5)).accessibilityLabel("Texte à générer")
            HStack {
                Text("Vitesse").font(.system(size: 11))
                Slider(value: $studio.speed, in: 0.75...1.5, step: 0.05).frame(maxWidth: 120).accessibilityLabel("Vitesse de diction")
                Text(String(format: "%.2f×", studio.speed)).font(.system(size: 10, design: .monospaced))
                Spacer()
                Button(studio.generating ? "Génération…" : "Générer", systemImage: "play.fill") { Task { await studio.generate() } }
                    .buttonStyle(.borderedProminent).tint(Dashboard.ink)
                    .disabled(controlsLocked || studio.state?.modele != true || studio.selectedVoiceID == nil || studio.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if studio.generating { ProgressView().controlSize(.small) }
            Text(studio.generationStatus).font(.system(size: 11)).foregroundStyle(Dashboard.muted)
            if studio.generating { generationDrawer }
            if studio.state?.modele != true || studio.selectedVoiceID == nil || studio.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(studio.state?.modele != true ? "Le modèle doit être prêt." : studio.selectedVoiceID == nil ? "Sélectionne une voix dans la bibliothèque." : "Écris un texte pour activer Générer.")
                    .font(.system(size: 11)).foregroundStyle(Dashboard.muted)
            }
            if let url = studio.resultURL {
                resultPlayer(url: url)
            }
        }.padding(18).frame(maxWidth: .infinity).dashboardPanel()
    }

    private var generationDrawer: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(Color.white.opacity(0.18)).frame(width: 42, height: 42)
                ProgressView().tint(.white)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Ta voix est en train d’être générée").font(.system(size: 13, weight: .semibold))
                Text(studio.generationStatus).font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.78))
            }
            Spacer()
            Text("LOCAL").font(.system(size: 9, weight: .bold, design: .monospaced)).tracking(1).foregroundStyle(Color.white.opacity(0.78))
        }.padding(15).foregroundStyle(.white).background(
            LinearGradient(colors: [Color(red: 0.12, green: 0.32, blue: 0.78), Color(red: 0.22, green: 0.54, blue: 0.92)], startPoint: .topLeading, endPoint: .bottomTrailing)
        ).clipShape(RoundedRectangle(cornerRadius: 10)).transition(.move(edge: .top).combined(with: .opacity))
    }

    private func resultPlayer(url: URL) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Prise générée").font(.system(size: 13, weight: .semibold))
                    Text(studio.generationStatus).font(.system(size: 10)).foregroundStyle(Dashboard.muted)
                }
                Spacer()
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            }
            HStack(alignment: .center, spacing: 14) {
                Button { Task { await studio.play(url) } } label: {
                    Image(systemName: studio.playing && studio.playingVoiceID == nil ? "stop.fill" : "play.fill")
                        .frame(width: 34, height: 34).foregroundStyle(.white).background(Dashboard.ink).clipShape(Circle())
                }.buttonStyle(.plain).accessibilityLabel("Lire la prise générée")
                GeometryReader { proxy in
                    HStack(alignment: .center, spacing: 2) {
                        ForEach(0..<48, id: \.self) { index in
                            waveformBar(index)
                        }
                    }.frame(width: proxy.size.width, height: 42)
                }.frame(height: 42)
                Button { studio.exportAudio() } label: { Image(systemName: "square.and.arrow.down") }.buttonStyle(.plain).help("Exporter le WAV")
            }
        }.padding(14).background(Color(red: 0.95, green: 0.97, blue: 1)).clipShape(RoundedRectangle(cornerRadius: 9))
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.blue.opacity(0.16), lineWidth: 1))
    }

    private func waveformBar(_ index: Int) -> some View {
        let alpha: Double = 0.42 + Double(index % 4) * 0.1
        let barHeight: CGFloat = CGFloat(7 + (index * 17 % 25))
        let color = Color.blue.opacity(alpha)
        return Capsule().fill(color).frame(width: 3, height: barHeight)
    }

    private var models: some View {
        VStack(alignment: .leading, spacing: 14) {
            panelTitle("Modèles", subtitle: "Installe et active les moteurs disponibles localement")
            if studio.models.isEmpty {
                Text("Démarre le studio pour accéder au catalogue de modèles.").font(.system(size: 12)).foregroundStyle(Dashboard.muted).padding(.vertical, 16)
            }
            ForEach([("tts", "TEXT-TO-SPEECH"), ("transcription", "SPEECH-TO-TEXT"), ("categorisation", "CATÉGORISATION")], id: \.0) { category, title in
                let entries = studio.models.filter { ($0.categorie ?? "tts") == category }
                if !entries.isEmpty { Text(title).font(.system(size: 10, weight: .semibold)).foregroundStyle(Dashboard.muted).padding(.top, 8) }
                ForEach(entries) { model in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 12) {
                        Image(systemName: "cpu").foregroundStyle(Dashboard.muted)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(model.label).fontWeight(.medium)
                            Text(model.repo).font(.system(size: 10)).foregroundStyle(Dashboard.muted).textSelection(.enabled)
                        }
                        Spacer()
                        Text(model.taille).foregroundStyle(Dashboard.muted)
                        if model.etat == "en_cours" { ProgressView().controlSize(.small); Text("Installation…") }
                        else if model.installe {
                            Button(model.actif == true || (category == "tts" && studio.state?.moteur == model.moteur && studio.state?.modele == true) ? "Actif" : "Activer") { Task { await studio.activate(model) } }
                                .disabled(controlsLocked || model.actif == true || (category == "tts" && studio.state?.moteur == model.moteur && studio.state?.modele == true))
                        } else {
                            Button(model.etat == "erreur" ? "Réessayer" : "Installer", systemImage: "arrow.down.circle") { Task { await studio.install(model) } }.disabled(controlsLocked)
                        }
                        Menu {
                            Button("Renommer") { renameValue = model.label; renamePath = "api/modeles/\(model.id)" }
                            if model.installe {
                                Button("Supprimer", role: .destructive) { deleteName = model.label; deletePath = "api/modeles/\(model.id)" }
                            }
                        } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).frame(width: 20).disabled(controlsLocked || model.etat == "en_cours")
                    }.font(.system(size: 12))
                    if let error = model.erreur { Text(error).font(.system(size: 11)).foregroundStyle(.red).textSelection(.enabled) }
                }.padding(.vertical, 8)
                if model.id != entries.last?.id { Divider() }
                }
            }
            if !studio.hfResults.isEmpty {
                Text("Suggestions Hugging Face").font(.system(size: 12, weight: .semibold)).padding(.top, 8)
                ForEach(studio.hfResults) { result in
                    HStack { Text(result.repo).font(.system(size: 11)); Spacer(); Text("\(result.telechargements ?? 0) téléchargements").font(.system(size: 10)).foregroundStyle(Dashboard.muted) }
                }
            }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading).dashboardPanel()
    }

    private var prises: some View {
        VStack(alignment: .leading, spacing: 14) {
            panelTitle("Prises générées", subtitle: "Retrouve toutes tes prises audio")
            if studio.audios.isEmpty { Text("Aucune prise générée pour le moment. Elle apparaîtra ici avec son transcript dès que tu lances une génération.").font(.system(size: 12)).foregroundStyle(Dashboard.muted) }
            ForEach(studio.audios) { audio in
                VStack(alignment: .leading, spacing: 8) {
                    HStack { Image(systemName: "waveform").foregroundStyle(.blue); Text(audio.nom).fontWeight(.medium); Spacer(); Text("\(Int(audio.duree)) s").foregroundStyle(Dashboard.muted)
                        Button { Task { await studio.play(studio.baseURL.appendingPathComponent("api/audio/\(audio.nom)"), voiceID: nil) } } label: { Image(systemName: "play.fill") }.buttonStyle(.borderless)
                        Button { studio.exportAudio(named: audio.nom) } label: { Image(systemName: "square.and.arrow.down") }.buttonStyle(.borderless).help("Exporter le WAV")
                    }
                    Text(audio.transcript.isEmpty ? "Transcript non disponible" : audio.transcript).font(.system(size: 11)).foregroundStyle(Dashboard.muted).lineLimit(3)
                }
                if audio.id != studio.audios.last?.id { Divider() }
            }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading).dashboardPanel()
    }

    /// Page Réglages, dans la fenêtre principale : sections empilées Providers / HF / À propos.
    private var reglages: some View {
        VStack(alignment: .leading, spacing: 22) {
            reglagesBloc("Providers IA", "Les services d'analyse des livres — GLM, DeepSeek, OpenAI ou Ollama local. Les clés restent sur ce Mac.") {
                ClesAPIView(studio: studio)
            }
            reglagesBloc("Clé Hugging Face", "Pour télécharger les modèles protégés (gated). Le token reste local à ce studio.") {
                hfCarte
            }
            reglagesBloc("À propos", nil) {
                AProposView()
            }
        }
    }

    private func reglagesBloc<Contenu: View>(_ titre: String, _ sousTitre: String?, @ViewBuilder contenu: () -> Contenu) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(titre).font(.system(size: 17, weight: .semibold))
                if let sousTitre {
                    Text(sousTitre).font(.system(size: 11)).foregroundStyle(Dashboard.muted)
                }
            }
            contenu()
        }
    }

    private var hfCarte: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Certains modèles sont protégés (gated). Marche à suivre :")
                .font(.system(size: 11)).foregroundStyle(Dashboard.muted)
            VStack(alignment: .leading, spacing: 6) {
                Text("1. Ouvre la page du modèle (lien sous son nom, section Modèles) et accepte les conditions « Agree and access repository ».")
                Text("2. Sur huggingface.co/settings/tokens : « Create new token », nomme-le, type « Read », puis « Create token ».")
                Text("3. Copie tout de suite le token affiché (il commence par hf_ — montré une seule fois).")
                Text("4. Colle-le ici, Enregistrer, puis relance Installer sur le modèle.")
            }.font(.system(size: 11)).foregroundStyle(Dashboard.muted)
            HStack {
                SecureField("hf_…", text: $studio.hfToken).textFieldStyle(.roundedBorder)
                Button("Enregistrer le token") { Task { await studio.saveHFToken() } }
                Button("Ouvrir Hugging Face") { studio.openHuggingFace() }
            }
            HStack(spacing: 14) {
                Button("Voir les modèles gated") { studio.openHuggingFace(URL(string: "https://huggingface.co/models?other=voice-cloning")!) }
                Button("Chercher des modèles légers") { Task { await studio.fetchHFModels() } }
            }.font(.system(size: 11)).buttonStyle(.link)
            if !studio.hfResults.isEmpty {
                Divider()
                Text("Suggestions Hugging Face").font(.system(size: 12, weight: .semibold))
                ForEach(studio.hfResults) { result in
                    HStack { Text(result.repo).font(.system(size: 11)); Spacer(); Text("\(result.telechargements ?? 0) téléchargements").font(.system(size: 10)).foregroundStyle(Dashboard.muted) }
                }
            }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading).dashboardPanel()
    }

    /// Section Livres : liste des EPUB + accès au studio dédié (fenêtre séparée).
    private var livres: some View {
        VStack(alignment: .leading, spacing: 14) {
            panelTitle("Livres", subtitle: "EPUB → audiobooks multi-voix, édités dans le studio dédié")
            if studio.books.isEmpty {
                Text(studio.state == nil ? "Démarre le studio pour voir tes livres." : "Aucun livre préparé pour le moment.")
                    .font(.system(size: 12)).foregroundStyle(Dashboard.muted).padding(.vertical, 8)
            }
            ForEach(studio.books) { book in
                HStack(spacing: 10) {
                    AsyncImage(url: studio.baseURL.appendingPathComponent("api/livres/\(book.id)/couverture")) { phase in
                        if let image = phase.image {
                            image.resizable().aspectRatio(contentMode: .fill)
                        } else {
                            Rectangle().fill(Dashboard.soft)
                                .overlay(Image(systemName: "book.closed").foregroundStyle(Dashboard.muted))
                        }
                    }
                    .frame(width: 34, height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).stroke(Dashboard.line, lineWidth: 1))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(book.titre).font(.system(size: 12, weight: .medium)).lineLimit(1)
                        Text("\(book.chapitres.count) chapitres · \(book.mots.formatted()) mots")
                            .font(.system(size: 10)).foregroundStyle(Dashboard.muted)
                    }
                    Spacer()
                    Button("Ouvrir") { openWindow(id: "book-studio") }
                        .buttonStyle(.bordered).controlSize(.small)
                        .help("Ouvrir ce studio des livres")
                }.padding(.vertical, 3)
                if book.id != studio.books.last?.id { Divider() }
            }
            Button("Ouvrir le studio des livres", systemImage: "book") { openWindow(id: "book-studio") }
                .buttonStyle(.bordered)
                .disabled(studio.state == nil)
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading).dashboardPanel()
    }

    private func panelTitle(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 13, weight: .semibold))
            Text(subtitle).font(.system(size: 11)).foregroundStyle(Dashboard.muted)
        }
    }
}

@MainActor
private struct WebStudioWindow: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let view = StudioWebView(url: url)
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {}
}

/// WebView du studio : sans cache HTTP (le serveur local redémarre avec l'app,
/// une réponse tronquée captée à ce moment ne doit jamais rester collée) et
/// avec reconnexion automatique pendant l'arrêt/relance du serveur.
@MainActor
private final class StudioWebView: WKWebView, WKNavigationDelegate {
    private let cible: URL
    private var tentatives = 0

    init(url: URL) {
        cible = url
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        super.init(frame: .zero, configuration: configuration)
        navigationDelegate = self
        var requete = URLRequest(url: cible)
        requete.cachePolicy = .reloadIgnoringLocalCacheData
        load(requete)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) n'est pas pris en charge") }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        tentatives = 0
    }

    /// Les liens externes (HF, Ko-fi, hub PK…) s'ouvrent dans le navigateur par
    /// défaut, jamais dans la fenêtre du studio.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url,
           let hote = url.host,
           !hote.hasPrefix("127.0.0.1"), !hote.hasPrefix("localhost") {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, url.host != nil {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        retenter()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        retenter()
    }

    /// Le serveur local peut être en train de redémarrer : on retente une minute.
    private func retenter() {
        guard tentatives < 30 else { return }
        tentatives += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self else { return }
            var requete = URLRequest(url: self.cible)
            requete.cachePolicy = .reloadIgnoringLocalCacheData
            self.load(requete)
        }
    }
}

// ------------------------------------------------------------- Réglages

struct ClesAPIView: View {
    @ObservedObject var studio: Studio
    @State private var charge = false
    @State private var editionID = ""
    @State private var nom = ""
    @State private var endpoint = ""
    @State private var modele = ""
    @State private var cle = ""
    @State private var statut = ""
    @State private var statutOK = false
    @State private var occupé = false
    @State private var testEnCours: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                entete
                if studio.state == nil {
                    Label("Le studio est éteint : démarre le serveur local pour gérer les providers.",
                          systemImage: "power").font(.caption).foregroundStyle(.secondary)
                } else {
                    listeProviders
                }
                formulaire
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .dashboardPanel()
        .task {
            guard !charge, studio.state != nil else { return }
            charge = true
            await studio.chargerProfilsIA()
        }
    }

    private var entete: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("L'analyse des livres (cast, attribution des voix) utilise un service compatible OpenAI — GLM, DeepSeek, OpenAI ou Ollama local. Les clés restent sur ce Mac, dans le dossier de données du studio.")
                .font(.caption).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var listeProviders: some View {
        VStack(alignment: .leading, spacing: 8) {
            if studio.iaProfils.isEmpty {
                Text(studio.error ?? "Aucun provider enregistré : ajoute ton service ci-dessous.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            ForEach(studio.iaProfils) { profil in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text(profil.nom).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                        if profil.actif {
                            Label("actif", systemImage: "checkmark.circle.fill")
                                .font(.caption2).foregroundStyle(.green)
                        } else if !profil.configure {
                            Label("incomplet", systemImage: "exclamationmark.triangle.fill")
                                .font(.caption2).foregroundStyle(.orange)
                        }
                        Spacer()
                        if !profil.actif {
                            Button("Activer") { Task { await studio.activerProfilIA(profil.id) } }
                                .buttonStyle(.bordered).controlSize(.small).disabled(occupé)
                        }
                        Button("Tester") {
                            testEnCours = profil.id
                            Task {
                                let resultat = await studio.testerProfilIA(profil.id)
                                if let erreur = resultat.erreur {
                                    statutOK = false
                                    statut = erreur
                                } else {
                                    statutOK = true
                                    statut = "Connecté — réponse : \(resultat.reponse ?? "ok")"
                                }
                                testEnCours = nil
                            }
                        }
                        .buttonStyle(.bordered).controlSize(.small)
                        .disabled(occupé || testEnCours == profil.id)
                        Button("Modifier") { remplir(profil) }
                            .buttonStyle(.bordered).controlSize(.small)
                        Button("Supprimer", role: .destructive) {
                            Task { await studio.supprimerProfilIA(profil.id) }
                        }
                        .buttonStyle(.bordered).controlSize(.small).disabled(occupé)
                    }
                    Text("\(profil.modele) · \(profil.base_url) · \(profil.cle_masquee ?? "sans clé")")
                        .font(.caption2).foregroundStyle(.secondary)
                        .lineLimit(1).truncationMode(.middle)
                        .textSelection(.enabled)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color(.controlBackgroundColor)))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(profil.actif ? Color.green.opacity(0.45) : Color(.separatorColor), lineWidth: 1))
            }
        }
    }

    private var formulaire: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text(editionID.isEmpty ? "Ajouter un provider" : "Modifier « \(nom) »").font(.subheadline.weight(.semibold))
                Spacer()
                if !editionID.isEmpty {
                    Button("Nouveau") { vider() }.buttonStyle(.borderless).font(.caption)
                }
            }
            LigneReglages(label: "Nom") {
                TextField("GLM principal · Ollama local", text: $nom).textFieldStyle(.roundedBorder)
            }
            LigneReglages(label: "Endpoint") {
                TextField("https://api.z.ai/api/coding/paas/v4", text: $endpoint)
                    .textFieldStyle(.roundedBorder)
            }
            LigneReglages(label: "Modèle") {
                TextField("glm-5.3-flash · qwen3:4b · gpt-4o-mini", text: $modele)
                    .textFieldStyle(.roundedBorder)
            }
            LigneReglages(label: editionID.isEmpty ? "Clé API" : "Nouvelle clé") {
                SecureField("clé distante — vide pour Ollama local ou conserver l'actuelle", text: $cle)
                    .textFieldStyle(.roundedBorder)
            }
            HStack(spacing: 12) {
                Button(editionID.isEmpty ? "Ajouter le provider" : "Enregistrer") {
                    occupé = true
                    Task {
                        let erreur = await studio.enregistrerProfilIA(
                            nom: nom.trimmingCharacters(in: .whitespaces),
                            endpoint: endpoint.trimmingCharacters(in: .whitespaces),
                            modele: modele.trimmingCharacters(in: .whitespaces),
                            cle: cle.trimmingCharacters(in: .whitespaces),
                            edition: editionID)
                        occupé = false
                        statutOK = erreur == nil
                        statut = erreur ?? (editionID.isEmpty ? "Provider ajouté." : "Provider modifié.")
                        if erreur == nil { vider() }
                    }
                }
                .buttonStyle(.borderedProminent).disabled(occupé || nom.isEmpty || endpoint.isEmpty || modele.isEmpty)
                if !statut.isEmpty {
                    Label(statut, systemImage: statutOK ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(statutOK ? .green : .red)
                        .textSelection(.enabled)
                }
            }
            Text("URL de base uniquement, sans /chat/completions. Le test interroge le provider avec « Réponds exactement : ok ».")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color(.controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color(.separatorColor), lineWidth: 1))
    }

    private func remplir(_ profil: IAProfil) {
        editionID = profil.id
        nom = profil.nom
        endpoint = profil.base_url
        modele = profil.modele
        cle = ""
        statut = ""
    }

    private func vider() {
        editionID = ""
        nom = ""
        endpoint = ""
        modele = ""
        cle = ""
        statut = ""
    }
}

private struct LigneReglages<Contenu: View>: View {
    let label: String
    @ViewBuilder let contenu: Contenu

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label).font(.caption).foregroundStyle(.secondary).frame(width: 78, alignment: .trailing)
            contenu
        }
    }
}

private struct AProposView: View {
    private let version = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "?"
    private let build = (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "1"

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 0) {
                    Image(nsImage: NSApp.applicationIconImage)
                        .resizable().interpolation(.high)
                        .frame(width: 88, height: 88)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(Color.primary.opacity(0.08), lineWidth: 1))
                        .padding(.top, 40).padding(.bottom, 16)
                    Text("PK Voice Cloner").font(.system(size: 24, weight: .bold))
                    Text("Version \(version) (\(build))")
                        .font(.system(size: 13)).foregroundStyle(.secondary).padding(.top, 4)
                    Text("Studio vocal 100 % local · Apple Silicon · macOS 14+")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                        .padding(.top, 2).padding(.bottom, 28)
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Ta voix, tes livres, ton Mac.").italic().font(.system(size: 13))
                        Text("Clone une voix avec quelques secondes de référence, génère la narration d'un EPUB en multi-voix avec attribution automatique des personnages, et écoute le résultat. Aucun audio ne quitte ce Mac.")
                            .font(.system(size: 13)).foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Moteurs : VoxCPM2, dots.tts, Qwen3-TTS et Pocket TTS. Mises à jour automatiques via Sparkle.")
                            .font(.system(size: 13)).foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }.frame(maxWidth: 480).padding(.bottom, 32)
                }
                .frame(maxWidth: .infinity)
            }
            Divider()
            HStack(spacing: 18) {
                Link(destination: URL(string: "https://ko-fi.com/pouark")!) {
                    Label("Soutenir sur Ko-fi", systemImage: "heart.fill")
                        .font(.caption).foregroundStyle(.red)
                }
                Link(destination: URL(string: "https://mondary.design/apps/")!) {
                    Label("Hub d'applications PK", systemImage: "square.grid.2x2")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Link(destination: URL(string: "https://github.com/mondary/Macos_PKvoicecloner")!) {
                    Label("GitHub", systemImage: "network")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text("Utilise une voix avec consentement.").font(.caption2).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 24).padding(.vertical, 14)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .dashboardPanel()
    }
}

private extension View {
    func dashboardPanel() -> some View {
        background(Color.white).clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Dashboard.line, lineWidth: 1))
    }
}

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    let studio = Studio()
    private var statusItem: NSStatusItem?
    private var preferenceObserver: NSObjectProtocol?
    func applicationDidFinishLaunching(_ notification: Notification) {
        UserDefaults.standard.register(defaults: ["showMenuBarIcon": true, "showDockIcon": true])
        applyPresentationPreferences()
        preferenceObserver = NotificationCenter.default.addObserver(forName: .pkAppPresentationPreferencesChanged, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.applyPresentationPreferences() }
        }
        UpdaterManager.shared.start()
        if CommandLine.arguments.contains("--stop") {
            Task {
                do { _ = try await studio.request("api/arreter", method: "POST", timeout: 3) }
                catch { fputs("Arrêt du studio : \(error.localizedDescription)\n", stderr) }
                NSApp.terminate(nil)
            }
        } else { NSApp.activate(ignoringOtherApps: true) }
    }
    private func applyPresentationPreferences() {
        if UserDefaults.standard.bool(forKey: "showDockIcon") {
            NSApp.setActivationPolicy(.regular)
        } else {
            NSApp.setActivationPolicy(.accessory)
        }
        if UserDefaults.standard.bool(forKey: "showMenuBarIcon") {
            if statusItem == nil {
                let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
                if let button = item.button {
                    button.image = NSImage(systemSymbolName: "waveform", accessibilityDescription: "PK Voice Cloner")
                    button.image?.isTemplate = true
                    button.toolTip = "PK Voice Cloner"
                    button.target = self
                    button.action = #selector(statusItemClicked)
                    button.sendAction(on: [.leftMouseUp, .rightMouseUp])
                }
                statusItem = item
            }
        } else if let statusItem {
            NSStatusBar.system.removeStatusItem(statusItem)
            self.statusItem = nil
        }
    }
    @objc private func statusItemClicked() {
        guard let event = NSApp.currentEvent else { return }
        if event.type == .rightMouseUp || event.modifierFlags.contains(.control) {
            guard let statusItem else { return }
            statusItem.menu = makeStatusMenu()
            defer { statusItem.menu = nil }
            statusItem.button?.performClick(nil)
        } else {
            showStudioFromMenuBar()
        }
    }

    private func menuTitle(_ fr: String, _ en: String, _ es: String, _ de: String) -> String {
        switch PKLanguage.current {
        case .fr: fr
        case .en: en
        case .es: es
        case .de: de
        }
    }

    private func makeStatusMenu() -> NSMenu {
        let menu = NSMenu()
        menu.autoenablesItems = false
        @discardableResult
        func add(_ title: String, symbol: String, action: Selector, key: String = "") -> NSMenuItem {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.target = self
            item.image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
            item.image?.isTemplate = true
            item.image?.size = NSSize(width: 16, height: 16)
            menu.addItem(item)
            return item
        }
        add(menuTitle("Ouvrir le studio", "Open Studio", "Abrir el estudio", "Studio öffnen"), symbol: "waveform", action: #selector(showStudioFromMenuBar))
        menu.addItem(.separator())
        add(menuTitle("Réglages…", "Settings…", "Ajustes…", "Einstellungen…"), symbol: "gearshape", action: #selector(showSettingsFromMenuBar), key: ",")
        let support = add(menuTitle("Soutenir sur Ko-fi", "Support on Ko-fi", "Apoyar en Ko-fi", "Auf Ko-fi unterstützen"), symbol: "heart.fill", action: #selector(openKoFi))
        if let path = Bundle.main.path(forResource: "kofi-logo", ofType: "png"), let logo = NSImage(contentsOfFile: path) {
            logo.isTemplate = false
            logo.size = NSSize(width: 16, height: 16)
            support.image = logo
        }
        support.attributedTitle = NSAttributedString(string: support.title, attributes: [.foregroundColor: NSColor(srgbRed: 1, green: 0.37, blue: 0.36, alpha: 1)])
        let updates = add(menuTitle("Rechercher les mises à jour…", "Check for Updates…", "Buscar actualizaciones…", "Nach Updates suchen…"), symbol: "arrow.triangle.2.circlepath", action: #selector(checkForUpdatesFromMenuBar))
        updates.isEnabled = UpdaterManager.shared.canCheckForUpdates
        add(menuTitle("À propos de PK Voice Cloner", "About PK Voice Cloner", "Acerca de PK Voice Cloner", "Über PK Voice Cloner"), symbol: "info.circle", action: #selector(showAboutFromMenuBar))
        menu.addItem(.separator())
        add(menuTitle("Quitter PK Voice Cloner", "Quit PK Voice Cloner", "Salir de PK Voice Cloner", "PK Voice Cloner beenden"), symbol: "rectangle.portrait.and.arrow.right", action: #selector(quitFromMenuBar), key: "q")
        return menu
    }

    @objc private func showSettingsFromMenuBar() {
        showStudioFromMenuBar()
        NotificationCenter.default.post(name: .pkOpenSettings, object: nil)
    }

    @objc private func showAboutFromMenuBar() {
        showStudioFromMenuBar()
        NotificationCenter.default.post(name: .pkOpenSettings, object: nil, userInfo: ["section": PKSettingsSection.about])
    }

    @objc private func checkForUpdatesFromMenuBar() {
        NSApp.activate(ignoringOtherApps: true)
        UpdaterManager.shared.checkForUpdates()
    }

    @objc private func openKoFi() {
        if let url = URL(string: "https://ko-fi.com/pouark") { NSWorkspace.shared.open(url) }
    }

    @objc private func quitFromMenuBar() { NSApp.terminate(nil) }

    @objc private func showStudioFromMenuBar() {
        NSApp.activate(ignoringOtherApps: true)
        if let window = NSApp.windows.first(where: { $0.title == "PK Voice Cloner" }) {
            window.makeKeyAndOrderFront(nil)
        } else {
            NSApp.windows.first?.makeKeyAndOrderFront(nil)
        }
    }
    func applicationWillTerminate(_ notification: Notification) { studio.terminate() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        !UserDefaults.standard.bool(forKey: "showMenuBarIcon")
    }
}

@main struct PKVoiceClonerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @Environment(\.openWindow) private var openWindow
    var body: some Scene {
        WindowGroup("PK Voice Cloner") { ContentView(studio: delegate.studio) }
            .defaultSize(width: 1180, height: 800)
             .commands {
                CommandGroup(replacing: .appSettings) {
                    Button("Réglages…") { NotificationCenter.default.post(name: .pkOpenSettings, object: nil) }
                        .keyboardShortcut(",", modifiers: .command)
                }
                CommandGroup(after: .help) {
                    Button("Soutenir PK Voice Cloner sur Ko-fi") {
                        if let url = URL(string: "https://ko-fi.com/pouark") {
                            NSWorkspace.shared.open(url)
                        }
                    }
                }
            }
        Window("Studio des livres", id: "book-studio") {
            WebStudioWindow(url: delegate.studio.baseURL)
                .frame(minWidth: 1050, idealWidth: 1280, maxWidth: .infinity,
                       minHeight: 680, idealHeight: 860, maxHeight: .infinity)
        }
        .defaultSize(width: 1280, height: 860)
        .windowResizability(.contentSize)
    }
}
