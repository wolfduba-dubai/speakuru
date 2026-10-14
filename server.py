"""Speakuru local test server.

Serves the website and a private /api/chat endpoint that talks to DeepSeek.
The API key lives only in the .env file (never in the website code).

Run:  python server.py   then open http://localhost:5500
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 5500


def load_key():
    path = os.path.join(HERE, ".env")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("DEEPSEEK_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return ""


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def do_GET(self):
        # never serve private files
        p = urllib.parse.unquote(self.path.split("?")[0]).lower()
        if p.startswith("/.") or p.endswith((".txt", ".py", ".env")):
            return self.send_error(404)
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/chat":
            return self.send_error(404)
        key = load_key()
        if not key or key == "paste-your-key-here":
            return self.reply(500, {"error": "no_key"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            messages = body["messages"][-30:]
        except Exception:
            return self.reply(400, {"error": "bad_request"})

        with open(os.path.join(HERE, "prompt.txt"), encoding="utf-8") as f:
            system = f.read()
        profile = body.get("profile") or {}
        if profile:
            system += "\n\nWHAT YOU ALREADY KNOW ABOUT THIS STUDENT:\n" + json.dumps(profile, ensure_ascii=False)

        req = urllib.request.Request(
            "https://api.deepseek.com/chat/completions",
            data=json.dumps({
                "model": "deepseek-chat",
                "messages": [{"role": "system", "content": system}] + messages,
                "temperature": 0.7,
                "max_tokens": 400,
            }).encode(),
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read())
            self.reply(200, {"reply": data["choices"][0]["message"]["content"]})
        except urllib.error.HTTPError as e:
            print("DeepSeek error:", e.code, e.read()[:300])
            self.reply(502, {"error": f"deepseek_{e.code}"})
        except Exception as e:
            print("DeepSeek error:", e)
            self.reply(502, {"error": "deepseek_down"})

    def reply(self, code, obj):
        out = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


if __name__ == "__main__":
    print(f"Speakuru running at http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
