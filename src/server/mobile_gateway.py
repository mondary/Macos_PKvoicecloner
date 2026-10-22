#!/usr/bin/env python3
"""Opt-in, token-protected mobile gateway to the local PK Voice Studio.

Start the normal studio first, then run this file. No external dependency.
Only voice listing, speech generation, job polling and generated audio are exposed.
"""
from __future__ import annotations

import argparse
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

READ_PATHS = re.compile(r"/api/(?:etat|voix|job/[a-f0-9]{10}|audio/[a-f0-9]{10}\.wav)\Z")
ASSIGN_PATH = "/api/attribuer"          # analyse IA du studio, à la demande du téléphone
ASSIGN_BODY_MAX = 512 * 1024            # un chapitre entier de phrases numérotées
ASSIGN_TIMEOUT = 600                    # l'analyse LLM peut durer plusieurs minutes


class Gateway(BaseHTTPRequestHandler):
    server_version = "PKReaderGateway/1"

    def log_message(self, fmt, *args):
        # Avoid logging request headers, codes or book text.
        pass

    def do_GET(self):
        self.forward()

    def do_POST(self):
        self.forward()

    def forward(self):
        authorization = self.headers.get("Authorization", "")
        if not hmac.compare_digest(authorization, f"Bearer {self.server.token}"):
            self.reply(401, {"detail": "Code de connexion incorrect."})
            return
        if self.command == "POST" and self.path == ASSIGN_PATH:
            self.forward_attribution()
            return
        if not ((self.command == "GET" and READ_PATHS.fullmatch(self.path)) or
                (self.command == "POST" and self.path == "/api/generer")):
            self.reply(404, {"detail": "Cette fonction n’est pas exposée au téléphone."})
            return
        body = None
        if self.command == "POST":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 16000:
                    raise ValueError("Taille invalide")
                payload = json.loads(self.rfile.read(length))
                text = payload.get("texte", "")
                voice = payload.get("reference_id", "")
                if not isinstance(text, str) or not 0 < len(text.strip()) <= 2000:
                    raise ValueError("Passage invalide")
                if not isinstance(voice, str) or not re.fullmatch(r"[a-f0-9]{12,64}", voice):
                    raise ValueError("Voix invalide")
                body = json.dumps({"texte": text, "reference_id": voice, "vitesse": 1}).encode()
            except (ValueError, TypeError, AttributeError):
                self.reply(400, {"detail": "Passage ou voix invalide."})
                return
        self.relay(body, 30)

    def forward_attribution(self):
        """Analyse des personnages demandée par le lecteur : phrases du téléphone
        → distribution + un locuteur par phrase (l'IA du studio fait le travail)."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= ASSIGN_BODY_MAX:
                raise ValueError("Taille invalide")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Corps invalide")
            titre = payload.get("titre") or "Livre"
            phrases = payload.get("phrases")
            if not isinstance(titre, str) or len(titre) > 120:
                raise ValueError("Titre invalide")
            if not isinstance(phrases, list) or not 1 <= len(phrases) <= 400:
                raise ValueError("Phrases invalides")
            if any(not isinstance(p, str) or not 1 <= len(p.strip()) <= 600 for p in phrases):
                raise ValueError("Phrase invalide")
            personnages = payload.get("personnages", [])
            if not isinstance(personnages, list) or len(personnages) > 200:
                raise ValueError("Distribution invalide")
            if any(not isinstance(p, dict) or
                   any(not isinstance(p.get(k), str) or not 1 <= len(p[k]) <= 80 for k in ("id", "nom")) or
                   p.get("genre") not in ("homme", "femme", "indetermine") or
                   p.get("role") not in ("narrateur", "personnage") for p in personnages):
                raise ValueError("Personnage invalide")
            body = json.dumps({"titre": titre, "phrases": phrases, "personnages": personnages}, ensure_ascii=False).encode()
        except (ValueError, TypeError, AttributeError):
            self.reply(400, {"detail": "Analyse invalide (400 phrases de 600 caractères et 200 personnages maximum)."})
            return
        self.relay(body, ASSIGN_TIMEOUT)

    def relay(self, body: bytes | None, timeout: int):
        request = Request(self.server.upstream + self.path, data=body,
                          headers={"Content-Type": "application/json"}, method=self.command)
        try:
            response = urlopen(request, timeout=timeout)
        except HTTPError as error:
            response = error
        except (URLError, TimeoutError):
            self.reply(503, {"detail": "Démarrez PK Voice Studio sur le Mac."})
            return
        try:
            with response:
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Cache-Control", "no-store")
                if response.headers.get("Content-Length"):
                    self.send_header("Content-Length", response.headers["Content-Length"])
                self.end_headers()
                while chunk := response.read(65536):
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def reply(self, code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def get_token(path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not path.exists():
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as output:
            output.write(secrets.token_urlsafe(24))
    token = path.read_text().strip()
    if len(token) < 16:
        raise ValueError(f"Code de connexion invalide dans {path}")
    return token


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8810)
    args = parser.parse_args()
    token = get_token(Path.home() / ".config/pkvoicecloner/mobile-token")
    server = ThreadingHTTPServer((args.host, args.port), Gateway)
    server.token = token
    server.upstream = "http://127.0.0.1:8809"
    address = args.host
    if address == "0.0.0.0":
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.connect(("192.0.2.1", 9))  # Route lookup only; no packet is sent.
                address = sock.getsockname()[0]
        except OSError:
            address = socket.gethostname() + ".local"
    print(f"PK Reader · dans Réglages → Votre studio vocal\nAdresse : http://{address}:{args.port}\nCode : {token}\nCtrl-C pour fermer la connexion mobile.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
