import Foundation

final class MockHTTP: URLProtocol {
    static var requests: [URLRequest] = []
    static var reject = false
    static var failJobOnce = true
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.requests.append(request)
        let path = request.url!.path
        if path == "/api/job/sample-job" && Self.failJobOnce {
            Self.failJobOnce = false
            client?.urlProtocol(self, didFailWithError: URLError(.timedOut))
            return
        }
        var json = "{}"
        if Self.reject { json = "{\"detail\":\"Opération refusée\"}" }
        else if path == "/api/etat" { json = "{\"modele\":true,\"voix\":true,\"moteur\":\"voxcpm2\",\"moteurs\":[],\"installes\":[]}" }
        else if path == "/api/voix" && request.httpMethod == "POST" { json = "{\"id\":\"sample\",\"transcript\":\"Bonjour\"}" }
        else if path == "/api/voix" { json = "{\"voix\":[{\"id\":\"sample\",\"nom\":\"Test\",\"duree\":1,\"transcript\":\"Bonjour\"}]}" }
        else if path == "/api/modeles" { json = "{\"modeles\":[]}" }
        else if path == "/api/generer" { json = "{\"job\":\"sample-job\"}" }
        else if path == "/api/job/sample-job" { json = "{\"etat\":\"pret\",\"fichier\":\"sample.wav\",\"duree\":1}" }
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.reject ? 409 : 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main struct StudioContracts {
    @MainActor static func main() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockHTTP.self]
        let studio = Studio(session: URLSession(configuration: configuration))
        let originalCWD = FileManager.default.currentDirectoryPath
        FileManager.default.changeCurrentDirectoryPath("/")
        let root = Studio.projectRoot(environment: ["PKVOICE_PROJET": originalCWD])
        precondition(root?.path == originalCWD, "Finder launch must not rely on cwd")
        FileManager.default.changeCurrentDirectoryPath(originalCWD)
        await studio.refresh()
        precondition(studio.state?.modele == true && studio.voices.count == 1)
        await studio.selectVoice(studio.voices[0])
        precondition(studio.selectedVoiceID == "sample" && studio.transcript == "Bonjour")
        await studio.rename("api/voix/sample", name: "Renommée")
        precondition(MockHTTP.requests.contains { $0.url?.path == "/api/voix/sample/renommer" && $0.httpMethod == "POST" })
        MockHTTP.reject = true
        await studio.delete("api/voix/sample")
        precondition(studio.error == "Opération refusée", "HTTP errors must be shown")
        precondition(!studio.busy)
        MockHTTP.reject = false
        let input = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
        try Data("test audio".utf8).write(to: input)
        defer { try? FileManager.default.removeItem(at: input) }
        await studio.importAudio(input)
        precondition(studio.error == nil && studio.selectedVoiceID == "sample")
        precondition(MockHTTP.requests.contains { $0.url?.path == "/api/voix" && $0.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true })
        let savedText = studio.text
        studio.text = "Bonjour"; studio.speed = 1.25
        await studio.generate()
        for _ in 0..<1000 {
            if !studio.generating { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        precondition(studio.resultURL != nil && !studio.generating, "A polling timeout must recover without losing the take")
        precondition(MockHTTP.requests.contains { $0.url?.path == "/api/job/sample-job" })
        precondition(MockHTTP.requests.contains { $0.url?.path == "/api/audio/sample.wav" })
        if let output = studio.resultURL { try? FileManager.default.removeItem(at: output) }
        studio.text = savedText
        print("Native contracts passed: Finder root, connection, selection, rename, HTTP errors, multipart import, generation polling and export data.")
    }
}
