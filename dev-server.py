# Dev-only static file server for previewing the app locally (no build step).
# chdir to an absolute path first so the sandbox never reads a blocked cwd,
# then serve with correct MIME types so ES modules load. NOT part of the
# shipped app (excluded from deploy via .vercelignore).
import http.server
import socketserver
import os

ROOT = "/Users/djvonfrank/Documents/DJ 2026 Workout App"
PORT = 4173

os.chdir(ROOT)

Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map = {
    **Handler.extensions_map,
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".html": "text/html",
}

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"dev-server on http://localhost:{PORT}")
    httpd.serve_forever()
