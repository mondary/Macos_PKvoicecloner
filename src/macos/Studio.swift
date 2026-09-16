import SwiftUI
import AppKit
import AVFoundation
import UniformTypeIdentifiers

struct ServerState: Codable {
    var modele: Bool
    var voix: Bool
    var moteur: String?
    var moteurs: [String]
    var installes: [String]
    var erreur: String?
    var chargement: Bool?
}
struct Voice: Codable, Identifiable { let id: String; let nom: String; let duree: Double?; let transcript: String? }
struct VoiceResponse: Codable { let voix: [Voice] }
struct Model: Codable, Identifiable {
    let id: String; let moteur: String; let repo: String; let taille: String
    let core: Bool; let installe: Bool; let label: String; let etat: String?; let erreur: String?
}
struct ModelResponse: Codable { let modeles: [Model] }
struct GeneratedAudio: Codable, Identifiable { let nom: String; let duree: Double; let taille: Int; let transcript: String; var id: String { nom } }
struct AudioResponse: Codable { let audios: [GeneratedAudio] }
struct HFResult: Codable, Identifiable { let repo: String; let telechargements: Int?; let likes: Int?; let gated: Bool?; var id: String { repo } }
struct HFResponse: Codable { let resultats: [HFResult] }
struct GenerationJob: Decodable { let etat: String; let fichier: String?; let duree: Double?; let erreur: String?; let ecoule: Double? }
struct StudioError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

@MainActor final class Studio: ObservableObject {
    @Published var state: ServerState?
    @Published var voices: [Voice] = []
    @Published var models: [Model] = []
    @Published var audios: [GeneratedAudio] = []
    @Published var hfToken = ""
    @Published var hfResults: [HFResult] = []
    @Published var text = UserDefaults.standard.string(forKey: "studio.text") ?? "" {
        didSet { UserDefaults.standard.set(text, forKey: "studio.text") }
    }
    @Published var message = "Studio arrêté"
    @Published var error: String?
    @Published var busy = false
    @Published var powerBusy = false
    @Published var generating = false
    @Published var recording = false
    @Published var recordingSeconds = 0
    @Published var selectedVoiceID: String?
    @Published var transcript = ""
    @Published var speed = 1.0
    @Published var resultURL: URL?
    @Published var generationStatus = "Choisis une voix et écris ton texte."
    @Published var loadingEngine: String?
    @Published var playing = false
    @Published var playingVoiceID: String?
    private(set) var process: Process?
    private var failedRefreshes = 0
    private var activity: NSObjectProtocol?
    private var logHandle: FileHandle?
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var recordingTimer: Task<Void, Never>?
    private var playbackTimer: Task<Void, Never>?
    private var generationTask: Task<Void, Never>?
    let baseURL: URL
    let session: URLSession
    let root: URL?

    init(baseURL: URL = URL(string: "http://127.0.0.1:8809")!, session: URLSession = .shared, root: URL? = Studio.projectRoot()) {
        self.baseURL = baseURL; self.session = session; self.root = root
    }

    nonisolated static func projectRoot(environment: [String: String] = ProcessInfo.processInfo.environment,
                                       bundleURL: URL = Bundle.main.bundleURL) -> URL? {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser
        var candidates: [URL] = []
        if let path = environment["PKVOICE_PROJET"], !path.isEmpty {
            candidates.append(URL(fileURLWithPath: (path as NSString).expandingTildeInPath))
        }
        candidates.append(bundleURL.deletingLastPathComponent())
        if let resource = Bundle.main.url(forResource: "ProjectRoot", withExtension: "txt"),
           let path = try? String(contentsOf: resource, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) {
            candidates.append(URL(fileURLWithPath: path))
        }
        candidates.append(home.appendingPathComponent("Documents/GitHub/PROJECTS/Macos_PKvoicecloner"))
        candidates.append(URL(fileURLWithPath: fm.currentDirectoryPath))
        return candidates.first { fm.fileExists(atPath: $0.appendingPathComponent("app/serveur.py").path)
            && fm.isExecutableFile(atPath: $0.appendingPathComponent(".venv/bin/python").path) }
    }

    func request(_ path: String, method: String = "GET", json: [String: Any]? = nil,
                 body: Data? = nil, contentType: String? = nil, timeout: TimeInterval = 20) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpMethod = method
        request.timeoutInterval = timeout
        request.httpBody = try json.map { try JSONSerialization.data(withJSONObject: $0) } ?? body
        if json != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw StudioError(message: "Réponse serveur invalide.") }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            throw StudioError(message: payload?["detail"] as? String ?? "Le serveur a refusé l’opération (HTTP \(http.statusCode)).")
        }
        return data
    }

    func refresh() async {
        guard !powerBusy else { return }
        do {
            state = try JSONDecoder().decode(ServerState.self, from: await request("api/etat", timeout: 5))
            loadingEngine = state?.chargement == true ? state?.moteur : nil
            failedRefreshes = 0
            if !busy { message = state?.erreur != nil ? "Moteur indisponible" : state?.modele == true ? "Studio prêt" : state?.chargement == false ? "Choisis un moteur" : "Chargement du modèle…" }
        } catch {
            failedRefreshes += 1
            if failedRefreshes >= 3 && !generating && !busy { state = nil; message = "Studio déconnecté"; selectedVoiceID = nil }
            return
        }
        do { try await refreshLibrary() }
        catch { self.error = "Actualisation impossible : \(error.localizedDescription)" }
    }

    func refreshLibrary() async throws {
        voices = try JSONDecoder().decode(VoiceResponse.self, from: await request("api/voix")).voix
        models = try JSONDecoder().decode(ModelResponse.self, from: await request("api/modeles")).modeles
        audios = (try? JSONDecoder().decode(AudioResponse.self, from: await request("api/audios")).audios) ?? []
        if let selectedVoiceID, !voices.contains(where: { $0.id == selectedVoiceID }) {
            self.selectedVoiceID = nil; transcript = ""
        }
        if selectedVoiceID == nil, let first = voices.first {
            _ = try? await request("api/voix/\(first.id)/choisir", method: "POST")
            self.selectedVoiceID = first.id
            self.transcript = first.transcript ?? ""
        }
    }

    func monitor() async {
        while !Task.isCancelled {
            await refresh()
            do { try await Task.sleep(for: .seconds(3)) } catch { return }
        }
    }

    func toggle() async {
        guard !powerBusy, !busy, !generating, !recording else { return }
        powerBusy = true; error = nil
        defer { powerBusy = false }
        if state != nil {
            do {
                _ = try await request("api/arreter", method: "POST")
                for _ in 0..<40 {
                    try await Task.sleep(for: .milliseconds(250))
                    do { _ = try await request("api/etat", timeout: 1) }
                    catch { state = nil; selectedVoiceID = nil; message = "Studio arrêté"; endActivity(); return }
                }
                throw StudioError(message: "L’arrêt prend plus longtemps que prévu. Réessaie dans quelques secondes.")
            } catch { self.error = error.localizedDescription }
            return
        }
        // A second app window or a previous session may already own the server.
        if let data = try? await request("api/etat", timeout: 1),
           let running = try? JSONDecoder().decode(ServerState.self, from: data) {
            state = running; message = "Studio connecté"
            do { try await refreshLibrary() } catch { self.error = error.localizedDescription }
            return
        }
        guard let root else { error = "Environnement Python introuvable. Relance install.sh dans le dossier du projet."; return }
        if activity == nil { activity = ProcessInfo.processInfo.beginActivity(options: .userInitiatedAllowingIdleSystemSleep, reason: "Studio vocal local") }
        message = "Démarrage du studio…"
        do {
            let p = Process()
            p.executableURL = root.appendingPathComponent(".venv/bin/python")
            p.arguments = [root.appendingPathComponent("app/serveur.py").path]
            p.currentDirectoryURL = root
            var env = ProcessInfo.processInfo.environment
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            env["PATH"] = "\(home)/.local/bin:/opt/homebrew/bin:/usr/local/bin:" + (env["PATH"] ?? "/usr/bin:/bin")
            env["PYTHONUNBUFFERED"] = "1"
            p.environment = env
            let log = root.appendingPathComponent("data/logs/serveur.log")
            try FileManager.default.createDirectory(at: log.deletingLastPathComponent(), withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil) }
            try? logHandle?.close()
            logHandle = try FileHandle(forWritingTo: log)
            try logHandle?.seekToEnd()
            p.standardOutput = logHandle; p.standardError = logHandle
            try p.run(); process = p
            for _ in 0..<120 {
                try await Task.sleep(for: .milliseconds(500))
                if !p.isRunning { throw StudioError(message: "Le serveur s’est arrêté au démarrage (code \(p.terminationStatus)). Consulte le journal du studio.") }
                if let data = try? await request("api/etat", timeout: 1),
                   let running = try? JSONDecoder().decode(ServerState.self, from: data) {
                    state = running; message = running.modele ? "Studio prêt" : "Chargement du modèle…"
                    try await refreshLibrary()
                    return
                }
            }
            if p.isRunning { p.terminate() }
            throw StudioError(message: "Le serveur ne répond pas après une minute. Consulte le journal du studio.")
        } catch { self.error = error.localizedDescription; message = "Démarrage impossible" }
    }

    func perform(_ action: () async throws -> Void) async {
        guard !busy else { return }
        busy = true; error = nil
        defer { busy = false }
        do { try await action() } catch { self.error = error.localizedDescription }
    }

    func engine(_ engine: String) async {
        await perform {
            _ = try await self.request("api/moteur", method: "POST", json: ["moteur": engine])
            await self.refresh()
        }
    }

    func cancelLoading() async {
        await perform {
            _ = try await self.request("api/chargement/annuler", method: "POST")
            await self.refresh()
        }
    }

    func selectVoice(_ voice: Voice) async {
        await perform {
            _ = try await self.request("api/voix/\(voice.id)/choisir", method: "POST")
            self.selectedVoiceID = voice.id; self.transcript = voice.transcript ?? ""
        }
    }

    func rename(_ path: String, name: String) async {
        await perform {
            _ = try await self.request("\(path)/renommer", method: "POST", json: ["nom": name])
            try await self.refreshLibrary()
        }
    }

    func delete(_ path: String) async {
        await perform {
            _ = try await self.request(path, method: "DELETE")
            try await self.refreshLibrary()
        }
    }

    func install(_ model: Model) async {
        await perform {
            _ = try await self.request("api/modeles/\(model.id)/installer", method: "POST")
            try await self.refreshLibrary()
        }
    }

    func saveHFToken() async {
        await perform { _ = try await self.request("api/hf/token", method: "POST", json: ["token": self.hfToken]) }
    }

    func fetchHFModels() async {
        await perform {
            let data = try await self.request("api/hf/recherche?q=lightweight%20text%20to%20speech&limite=12")
            self.hfResults = (try? JSONDecoder().decode(HFResponse.self, from: data).resultats) ?? []
        }
    }

    func chooseAudio() {
        let panel = NSOpenPanel()
        panel.title = "Importer une référence vocale"
        panel.allowedContentTypes = [.audio] + ["m4a", "mp3", "wav", "webm", "flac", "ogg"].compactMap { UTType(filenameExtension: $0) }
        panel.allowsMultipleSelection = false
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            Task { @MainActor in await self.importAudio(url) }
        }
    }

    func importAudio(_ url: URL) async {
        await perform {
            self.message = "Import et transcription…"
            defer { self.message = self.state?.modele == true ? "Studio prêt" : "Studio connecté" }
            let boundary = "PKVoice-\(UUID().uuidString)"
            let filename = url.lastPathComponent.replacingOccurrences(of: "\"", with: "_").replacingOccurrences(of: "\r", with: "_").replacingOccurrences(of: "\n", with: "_")
            let accessible = url.startAccessingSecurityScopedResource()
            defer { if accessible { url.stopAccessingSecurityScopedResource() } }
            var data = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"\(filename)\"\r\nContent-Type: application/octet-stream\r\n\r\n".utf8)
            data.append(try Data(contentsOf: url))
            data.append(Data("\r\n--\(boundary)--\r\n".utf8))
            let response = try await self.request("api/voix", method: "POST", body: data, contentType: "multipart/form-data; boundary=\(boundary)", timeout: 660)
            struct Imported: Decodable { let id: String; let transcript: String }
            let imported = try JSONDecoder().decode(Imported.self, from: response)
            self.selectedVoiceID = imported.id; self.transcript = imported.transcript
            try await self.refreshLibrary()
        }
    }

    func toggleRecording() async {
        if recording {
            recorder?.stop(); recording = false; recordingTimer?.cancel()
            guard let url = recorder?.url else { return }
            recorder = nil
            await importAudio(url)
            // Keep the recording if import/transcription failed so the user can retry.
            if error == nil { try? FileManager.default.removeItem(at: url) }
            else { error = "\(error ?? "Import impossible")\nL’enregistrement est conservé dans \(url.path)." }
            return
        }
        guard !busy, state != nil else { return }
        error = nil; busy = true
        let allowed = await AVCaptureDevice.requestAccess(for: .audio)
        busy = false
        guard allowed else { error = "Accès au micro refusé. Autorise PK Voice Cloner dans Réglages Système → Confidentialité et sécurité → Microphone."; return }
        do {
            let folder = (root ?? FileManager.default.temporaryDirectory).appendingPathComponent("data/enregistrements")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let url = folder.appendingPathComponent("prise-\(UUID().uuidString).m4a")
            recorder = try AVAudioRecorder(url: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue])
            guard recorder?.record() == true else { throw StudioError(message: "Impossible de démarrer le microphone.") }
            recording = true; recordingSeconds = 0
            recordingTimer = Task { [weak self] in
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(1)) } catch { return }
                    self?.recordingSeconds += 1
                }
            }
        } catch { self.error = error.localizedDescription }
    }

    func play(_ url: URL, voiceID: String? = nil) async {
        if playing && playingVoiceID == voiceID { stopPlayback(); return }
        await perform {
            self.stopPlayback()
            let data: Data
            if url.isFileURL { data = try Data(contentsOf: url) }
            else { data = try await self.request(url.path) }
            self.player = try AVAudioPlayer(data: data)
            guard self.player?.play() == true else { throw StudioError(message: "Lecture audio impossible.") }
            self.playing = true; self.playingVoiceID = voiceID
            self.playbackTimer = Task { [weak self] in
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .milliseconds(200)) } catch { return }
                    guard let self else { return }
                    if self.player?.isPlaying != true { self.stopPlayback(); return }
                }
            }
        }
    }

    func stopPlayback() { player?.stop(); playing = false; playingVoiceID = nil; playbackTimer?.cancel() }

    private func generationRequest(_ path: String, timeout: TimeInterval = 20) async throws -> Data {
        for attempt in 0..<6 {
            do { return try await request(path, timeout: timeout) }
            catch let error as URLError where [.timedOut, .networkConnectionLost, .cannotConnectToHost].contains(error.code) {
                if attempt == 5 { throw error }
                generationStatus = "Le calcul continue · reconnexion au studio…"
                try await Task.sleep(for: .milliseconds(500))
            }
        }
        throw StudioError(message: "Le studio ne répond plus.")
    }

    func generate() async {
        guard !generating, !busy, selectedVoiceID != nil, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        generating = true; error = nil; resultURL = nil; generationStatus = "Génération en cours…"
        let input = text, pace = speed, reference = transcript
        generationTask = Task {
            defer { generating = false }
            do {
                let data = try await request("api/generer", method: "POST", json: ["texte": input, "vitesse": pace, "transcript": reference])
                struct Created: Decodable { let job: String }
                let created = try JSONDecoder().decode(Created.self, from: data)
                while !Task.isCancelled {
                    let job = try JSONDecoder().decode(GenerationJob.self, from: await generationRequest("api/job/\(created.job)"))
                    if job.etat == "erreur" { throw StudioError(message: job.erreur ?? "La génération a échoué.") }
                    if job.etat == "pret", let filename = job.fichier {
                        let audio = try await generationRequest("api/audio/\(filename)", timeout: 120)
                        let output = FileManager.default.temporaryDirectory.appendingPathComponent("pk-voice-\(UUID().uuidString).wav")
                        try audio.write(to: output)
                        resultURL = output
                        generationStatus = "Prise prête · \(Int(job.duree ?? 0)) s · WAV"
                        return
                    }
                    generationStatus = "\(job.etat == "chargement" ? "Chargement du modèle" : "Génération") · \(Int(job.ecoule ?? 0)) s"
                    try await Task.sleep(for: .seconds(1))
                }
            } catch { self.error = error.localizedDescription; generationStatus = "La prise n’a pas pu être générée." }
        }
    }

    func exportAudio() {
        guard let source = resultURL else { return }
        let panel = NSSavePanel(); panel.allowedContentTypes = [.wav]; panel.nameFieldStringValue = "pk-voice-studio.wav"
        panel.begin { response in
            guard response == .OK, let target = panel.url else { return }
            do { try Data(contentsOf: source).write(to: target, options: .atomic) }
            catch { self.error = "Export impossible : \(error.localizedDescription)" }
        }
    }

    func exportAudio(named name: String) {
        Task { @MainActor in
            do {
                let data = try await request("api/audio/\(name)", timeout: 120)
                let panel = NSSavePanel(); panel.allowedContentTypes = [.wav]; panel.nameFieldStringValue = name
                panel.begin { response in
                    guard response == .OK, let target = panel.url else { return }
                    do { try data.write(to: target, options: .atomic) } catch { self.error = "Export impossible : \(error.localizedDescription)" }
                }
            } catch { self.error = "Lecture du fichier impossible : \(error.localizedDescription)" }
        }
    }

    func openLog() {
        if let root { NSWorkspace.shared.open(root.appendingPathComponent("data/logs/serveur.log")) }
    }

    func openHuggingFace(_ url: URL = URL(string: "https://huggingface.co/settings/tokens")!) {
        NSWorkspace.shared.open(url)
    }

    private func endActivity() {
        if let activity { ProcessInfo.processInfo.endActivity(activity); self.activity = nil }
    }

    func terminate() {
        endActivity()
        generationTask?.cancel(); recordingTimer?.cancel(); stopPlayback(); recorder?.stop()
        // Only terminate the process started by this app, not an external studio.
        if let process, process.isRunning { process.terminate() }
    }
}
