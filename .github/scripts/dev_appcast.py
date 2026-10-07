#!/usr/bin/env python3
"""Create the single-item signed Sparkle feed for the rolling Dev release."""
import base64
import datetime
import os
import pathlib
import sys

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

zip_path, build, version = sys.argv[1:]
archive = pathlib.Path(zip_path).read_bytes()
key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(os.environ["SPARKLE_PRIVATE_KEY"].strip()))
signature = base64.b64encode(key.sign(archive)).decode()
date = datetime.datetime.now(datetime.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
pathlib.Path("appcast-dev.xml").write_text(f'''<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" xmlns:dc="http://purl.org/dc/elements/1.1/">
 <channel><title>PK Voice Cloner (dev)</title>
 <link>https://raw.githubusercontent.com/mondary/Macos_PKvoicecloner/main/appcast-dev.xml</link>
 <description>Canal de développement PK Voice Cloner</description><language>fr</language>
 <item><title>PK Voice Cloner {version}</title><pubDate>{date}</pubDate>
 <sparkle:version>{build}</sparkle:version><sparkle:shortVersionString>{version}</sparkle:shortVersionString>
 <sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
 <enclosure url="https://github.com/mondary/Macos_PKvoicecloner/releases/download/dev/PKVoiceCloner-dev.zip" sparkle:edSignature="{signature}" length="{len(archive)}" type="application/octet-stream" />
 </item></channel></rss>
''', encoding="utf-8")
