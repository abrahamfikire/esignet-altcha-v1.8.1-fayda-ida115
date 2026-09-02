#!/usr/bin/env python3
"""Serve VeriFayda oidc-ui artifactory assets for local docker-compose."""
from __future__ import annotations
import argparse, io, mimetypes, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

HERE = Path(__file__).resolve().parents[1]
# Prefer the VeriFayda artifactory checkout (correct branding / locales).
ORIG = Path("/home/amani/Documents/nidp/verifayda_artifactory/artifactory-server/artifacts/src")
MIRROR = HERE / "verifayda-artifactory-src"
OIDC_PUBLIC = HERE / "oidc-ui" / "public"
SRC = ORIG if (ORIG / "i18n/esignet-i18n-bundle").is_dir() else MIRROR
I18N = SRC / "i18n" / "esignet-i18n-bundle"
THEME = SRC / "theme" / "esignet-theme"
IMAGE = SRC / "image" / "esignet-image"

def cors(h):
    h.send_header("Access-Control-Allow-Origin", "*")
    h.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
    h.send_header("Access-Control-Allow-Headers", "*")
    h.send_header("Cache-Control", "no-store")

def zip_bytes(folder: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in folder.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(folder).as_posix())
    return buf.getvalue()

def resolve(path: str):
    if path == "/logo.png":
        for candidate in (OIDC_PUBLIC / "logo.png", OIDC_PUBLIC / "images" / "logo.png", IMAGE / "logo.png"):
            if candidate.is_file():
                return candidate
        return IMAGE / "logo.png"
    if path == "/favicon.ico":
        for candidate in (OIDC_PUBLIC / "images" / "favicon.ico", IMAGE / "favicon.ico", IMAGE / "logo.png"):
            if candidate.is_file():
                return candidate
        return IMAGE / "favicon.ico"
    if path.startswith("/locales/"):
        live = OIDC_PUBLIC / "locales" / path[len("/locales/"):]
        if live.is_file():
            return live
        return I18N / path[len("/locales/"):]
    if path.startswith("/theme/"):
        live = OIDC_PUBLIC / "theme" / path[len("/theme/"):]
        if live.is_file():
            return live
        return THEME / path[len("/theme/"):]
    if path.startswith("/images/"):
        live = OIDC_PUBLIC / "images" / path[len("/images/"):]
        if live.is_file():
            return live
        return IMAGE / path[len("/images/"):]
    return None

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))
    def do_OPTIONS(self):
        self.send_response(204); cors(self); self.end_headers()
    def do_HEAD(self): self._serve(True)
    def do_GET(self): self._serve(False)
    def _serve(self, head_only: bool):
        path = unquote(urlparse(self.path).path)
        zmap = {
            "/artifactory/libs-release-local/i18n/esignet-i18n-bundle.zip": I18N,
            "/artifactory/libs-release-local/theme/esignet-theme.zip": THEME,
            "/artifactory/libs-release-local/image/esignet-image.zip": IMAGE,
        }
        if path in zmap:
            data = zip_bytes(zmap[path])
            self.send_response(200); cors(self)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(len(data))); self.end_headers()
            if not head_only: self.wfile.write(data)
            return
        target = resolve(path)
        if not target or not target.is_file():
            self.send_response(404); cors(self); self.end_headers()
            if not head_only: self.wfile.write(b"Not Found")
            return
        data = target.read_bytes()
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200); cors(self)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data))); self.end_headers()
        if not head_only: self.wfile.write(data)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--host", default="0.0.0.0"); ap.add_argument("--port", type=int, default=8080)
    args = ap.parse_args()
    for d in (I18N, THEME, IMAGE):
        if not d.is_dir(): raise SystemExit(f"Missing {d}")
    print(f"Serving VeriFayda assets from {SRC}")
    print(f"Listening http://{args.host}:{args.port}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()

if __name__ == "__main__":
    main()
