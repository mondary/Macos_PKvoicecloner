import importlib.util
from pathlib import Path
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location("gateway", Path(__file__).parents[2] / "server/mobile_gateway.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


class GatewayAccessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), gateway.Gateway)
        cls.server.token = "test-only-connection-code"
        cls.server.upstream = "http://127.0.0.1:1"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def status(self, path, token=None, body=None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        req = Request(f"http://127.0.0.1:{self.server.server_port}{path}", headers=headers, data=body)
        try:
            with urlopen(req) as response:
                return response.status
        except HTTPError as error:
            return error.code

    def test_rejects_missing_or_wrong_code(self):
        self.assertEqual(self.status("/api/voix"), 401)
        self.assertEqual(self.status("/api/voix", "wrong"), 401)

    def test_does_not_expose_destructive_or_secret_endpoints(self):
        for path in ("/api/arreter", "/api/ia/config", "/api/hf/token", "/api/voix/123/renommer"):
            self.assertEqual(self.status(path, self.server.token, b"{}"), 404)

    def test_valid_read_returns_useful_error_when_studio_is_off(self):
        self.assertEqual(self.status("/api/voix", self.server.token), 503)

    def test_rejects_invalid_generation_payload(self):
        self.assertEqual(self.status("/api/generer", self.server.token, b'{"texte":"hi"}'), 400)


if __name__ == "__main__":
    unittest.main()
