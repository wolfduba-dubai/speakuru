"""Speakuru local test server.

Serves the website and a private /api/chat endpoint that talks to DeepSeek.
The API key lives only in the .env file (never in the website code).
Maya's instructions live in prompts/*.txt, lessons in curriculum.json.

Run:  python server.py   then open http://localhost:5500
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
MODES = ("onboarding", "lesson", "free")

TAP_ONLY = ("TAP-ONLY MODE: the student cannot speak or type right now. Never use SPEAK. "
            "Every message must end with a CHOICES, QUIZ, BUILD or LISTEN tag so they can answer by tapping. "
            "In role-plays, always give CHOICES.")


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


def load_key():
    try:
        for line in read(".env").splitlines():
            if line.strip().startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return ""


def find_lesson(lesson_id):
    for level in json.loads(read("curriculum.json"))["levels"]:
        for lesson in level["lessons"]:
            if lesson["id"] == lesson_id:
                return level, lesson
    return None, None


def build_system(body):
    """Same logic as worker.js — keep both in sync."""
    mode = body.get("mode") if body.get("mode") in MODES else "onboarding"
    system = read("prompts/base.txt") + "\n\n" + read(f"prompts/{mode}.txt")
    if mode == "lesson":
        level, lesson = find_lesson(str(body.get("lessonId", "")))
        if lesson:
            system += (f"\n\nTODAY'S LESSON:\nLevel: {level['title']} ({level['cefr']})\n"
                       f"Lesson: {lesson['title']}\nKey words: {', '.join(lesson['words'])}")
    if body.get("tapOnly"):
        system += "\n\n" + TAP_ONLY
    profile = body.get("profile")
    if isinstance(profile, dict) and profile:
        system += "\n\nWHAT YOU ALREADY KNOW ABOUT THIS STUDENT:\n" + json.dumps(profile, ensure_ascii=False)[:500]
    return system


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
            messages = [{"role": m["role"], "content": str(m["content"])[:1500]}
                        for m in body["messages"][-30:] if m.get("role") in ("user", "assistant")]
        except Exception:
            return self.reply(400, {"error": "bad_request"})

        req = urllib.request.Request(
            "https://api.deepseek.com/chat/completions",
            data=json.dumps({
                "model": "deepseek-chat",
                "messages": [{"role": "system", "content": build_system(body)}] + messages,
                "temperature": 0.7,
                "max_tokens": 500,
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
