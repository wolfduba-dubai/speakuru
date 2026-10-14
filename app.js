/* ================= Speakuru — app.js ================= */

const $ = (s) => document.querySelector(s);

// Maya's brain: the local test server on this PC, or the Cloudflare Worker on the real site
const WORKER_URL = "https://speakuru-api.wolfduba.workers.dev/api/chat";
const API_URL = location.hostname === "localhost" ? "/api/chat" : WORKER_URL;

/* ---------- tiny safe storage ---------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("speakuru:" + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("speakuru:" + k, JSON.stringify(v)); } catch {} },
};
// For testing: open localhost:5500/?reset to start again as a new student
if (new URLSearchParams(location.search).has("reset")) {
  try { Object.keys(localStorage).filter((k) => k.startsWith("speakuru:")).forEach((k) => localStorage.removeItem(k)); } catch {}
  history.replaceState(null, "", location.pathname);
}

/* ---------- screens (hash routing so phone "back" works) ---------- */
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === id));
  window.scrollTo(0, 0);
  if (id === "chat") startChat();
  if (id !== "chat") stopAll();
}
function go(id) { location.hash = id === "home" ? "" : id; }
window.addEventListener("hashchange", () => show(location.hash.slice(1) || "home"));
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

/* ================= HOME: rotating greetings ================= */
// [greeting, language name, title (with highlight), subtitle, right-to-left?]
const greetings = [
  ["Hello", "English", "Your personal <span class='hl'>AI English</span> teacher.", "Speak or type, anytime, 24/7."],
  ["Halo", "Bahasa Indonesia", "Guru <span class='hl'>AI bahasa Inggris</span> pribadimu.", "Bicara atau ketik, kapan saja, 24 jam."],
  ["مرحبا", "العربية", "معلمتك الشخصية <span class='hl'>للغة الإنجليزية</span> بالذكاء الاصطناعي.", "تحدّث أو اكتب، في أي وقت، على مدار الساعة.", true],
  ["Hola", "Español", "Tu profesora personal de <span class='hl'>inglés con IA</span>.", "Habla o escribe, cuando quieras, 24/7."],
  ["こんにちは", "日本語", "あなた専用の<span class='hl'>AI英語</span>の先生。", "話しても、入力しても。いつでも24時間。"],
  ["Bonjour", "Français", "Ta prof d'<span class='hl'>anglais IA</span> personnelle.", "Parle ou écris, quand tu veux, 24h/24."],
  ["Xin chào", "Tiếng Việt", "Giáo viên <span class='hl'>tiếng Anh AI</span> riêng của bạn.", "Nói hoặc gõ, bất cứ lúc nào, 24/7."],
];
let gi = 0;
setInterval(() => {
  const box = $(".greet"), tag = $("#tagline");
  box.classList.remove("in"); tag.classList.remove("in");
  box.classList.add("out"); tag.classList.add("out");
  setTimeout(() => {
    gi = (gi + 1) % greetings.length;
    const [word, lang, title, sub, rtl] = greetings[gi];
    $("#greetWord").textContent = word;
    $("#greetLang").textContent = lang;
    $("#tagTitle").innerHTML = title;
    $("#tagSub").textContent = sub;
    tag.dir = rtl ? "rtl" : "ltr";
    box.classList.remove("out"); tag.classList.remove("out");
    void box.offsetWidth;
    box.classList.add("in"); tag.classList.add("in");
  }, 340);
}, 3200);

$("#btnStart").addEventListener("click", () => {
  unlockVoice();
  go("language");
});

/* ================= LANGUAGE LIST ================= */
const languages = [
  { code: "id", flag: "id", native: "Bahasa Indonesia", en: "Indonesian", ready: true },
  { code: "ja", flag: "jp", native: "日本語", en: "Japanese" },
  { code: "ar", flag: "sa", native: "العربية", en: "Arabic" },
  { code: "es", flag: "es", native: "Español", en: "Spanish" },
  { code: "pt", flag: "br", native: "Português", en: "Portuguese" },
  { code: "vi", flag: "vn", native: "Tiếng Việt", en: "Vietnamese" },
  { code: "th", flag: "th", native: "ภาษาไทย", en: "Thai" },
  { code: "tr", flag: "tr", native: "Türkçe", en: "Turkish" },
];
// languages you can learn (only English for now)
const learnable = [
  { code: "en", flag: "gb", native: "English", en: "Bahasa Inggris", ready: true },
  { code: "id", flag: "id", native: "Bahasa Indonesia", en: "Indonesian" },
  { code: "ja", flag: "jp", native: "日本語", en: "Japanese" },
  { code: "ar", flag: "sa", native: "العربية", en: "Arabic" },
  { code: "es", flag: "es", native: "Español", en: "Spanish" },
  { code: "fr", flag: "fr", native: "Français", en: "French" },
  { code: "ko", flag: "kr", native: "한국어", en: "Korean" },
];

function renderLangs(el, list) {
  el.innerHTML = list.map((l, i) => `
  <button class="lang ${l.ready ? "on" : "soon"}" data-code="${l.code}" style="animation-delay:${i * 45}ms" ${l.ready ? "" : 'aria-disabled="true"'}>
    <span class="fi fi-${l.flag}"></span>
    <span class="names"><b>${l.native}</b><small>${l.en}</small></span>
    <span class="tag">${l.ready ? "Pilih" : "Coming soon"}</span>
  </button>`).join("");
}
renderLangs($("#langList"), languages);
renderLangs($("#learnList"), learnable);

function onPick(el, key, next) {
  el.addEventListener("click", (e) => {
    const btn = e.target.closest(".lang");
    if (!btn) return;
    if (btn.classList.contains("soon")) return toast("Coming soon 🚀");
    unlockVoice();
    store.set(key, btn.dataset.code);
    go(next);
  });
}
onPick($("#langList"), "lang", "learn");    // 1. language you speak
onPick($("#learnList"), "learnLang", "chat"); // 2. language you want to learn

/* ================= VOICE: Maya speaks ================= */
let muted = store.get("muted") === true;
let voiceId = null, voiceEn = null;
const synth = window.speechSynthesis;

function pickVoice() {
  if (!synth) return;
  const vs = synth.getVoices();
  const norm = (v) => v.lang.replace("_", "-");
  voiceId = vs.find((v) => norm(v) === "id-ID" && /google/i.test(v.name))
         || vs.find((v) => norm(v).startsWith("id")) || null;
  voiceEn = vs.find((v) => norm(v) === "en-US" && /google us english/i.test(v.name))
         || vs.find((v) => norm(v) === "en-US" && /female|aria|jenny|zira|samantha/i.test(v.name))
         || vs.find((v) => norm(v).startsWith("en")) || null;
}
if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

// Phones block sound until a tap — speak a silent word on the first tap.
let unlocked = false;
function unlockVoice() {
  if (unlocked || !synth) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  synth.speak(u);
  unlocked = true;
}

/* ---------- "speaking" animation: rings + sound bars around Maya's photo ---------- */
function mouth(on) {
  $("#mayaFace").classList.toggle("speaking", on);
}

function setStatus(text, cls = "") {
  const s = $("#status");
  s.textContent = text;
  s.className = cls;
}

const stripEmoji = (t) => t.replace(/[\p{Extended_Pictographic}‍️]/gu, "").trim();

/* English is the main text; Indonesian help comes inside ((...)).
   "Hi! ((Halo!)) How are you?" -> [{t:"Hi! ", en:true}, {t:"Halo!", en:false}, {t:" How are you?", en:true}] */
function segments(text) {
  return text.replace(/\{\{|\}\}/g, "").split(/(\(\([\s\S]*?\)\))/).filter((p) => p.trim()).map((p) =>
    p.startsWith("((") ? { t: " " + p.slice(2, -2).trim() + " ", en: false } : { t: p, en: true });
}

function fillBubble(bubble, segs) {
  segs.forEach((s) => {
    const n = document.createElement(s.en ? "span" : "small");
    if (!s.en) n.className = "id";
    n.textContent = s.t;
    bubble.appendChild(n);
  });
}

/* Maya says something: types the text + speaks it (Indonesian voice + English voice) */
let sayToken = 0;
function mayaSay(text) {
  const my = ++sayToken;
  const segs = segments(text);
  return new Promise((resolve) => {
    const bubble = addMsg("", "maya typing");
    let speechDone = muted || !synth;
    let typeDone = false;
    const finish = () => {
      if (!(speechDone && typeDone) || my !== sayToken) return;
      bubble.classList.remove("typing");
      mouth(false);
      setStatus("online");
      resolve();
    };

    mouth(true);
    setStatus("berbicara…", "speaking");

    // typing effect, segment by segment (English parts highlighted)
    let si = 0, ci = 0, node = null;
    const type = () => {
      if (my !== sayToken) { bubble.textContent = ""; fillBubble(bubble, segs); bubble.classList.remove("typing"); return; }
      if (!node) {
        node = document.createElement(segs[si].en ? "span" : "small");
        if (!segs[si].en) node.className = "id";
        bubble.appendChild(node);
      }
      node.textContent = segs[si].t.slice(0, ++ci);
      scrollDown();
      if (ci >= segs[si].t.length) { si++; ci = 0; node = null; }
      if (si < segs.length) setTimeout(type, 24);
      else { typeDone = true; finish(); }
    };
    if (segs.length) type(); else typeDone = true;

    if (!speechDone) {
      synth.cancel();
      const parts = segs.map((s) => ({ ...s, t: stripEmoji(s.t) })).filter((s) => /[\p{L}\p{N}]/u.test(s.t));
      if (!parts.length) { speechDone = true; finish(); return; }
      parts.forEach((s, i) => {
        const u = new SpeechSynthesisUtterance(s.t);
        u.lang = s.en ? "en-US" : "id-ID";
        const v = s.en ? voiceEn : voiceId;
        if (v) u.voice = v;
        u.rate = s.en ? 0.95 : 1;      // English a bit slower, easier to follow
        u.pitch = 1.1;
        if (i === parts.length - 1) u.onend = u.onerror = () => { speechDone = true; finish(); };
        synth.speak(u);
      });
    }
  });
}

/* ================= CHAT ================= */
function addMsg(text, cls) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  $("#messages").appendChild(d);
  scrollDown();
  return d;
}
function scrollDown() { const m = $("#messages"); m.scrollTop = m.scrollHeight; }

let chatLog = store.get("history") || [];   // [{role, content}] sent to DeepSeek
let profile = store.get("profile") || {};   // {name, age, goal, level}
let chatStarted = false;
let busy = false;

function saveChat() {
  chatLog = chatLog.slice(-40);
  store.set("history", chatLog);
  store.set("profile", profile);
}

function startChat() {
  if (chatStarted) return;
  chatStarted = true;
  // show the last few messages again
  chatLog.slice(-6).forEach((m) => fillBubble(addMsg("", m.role === "user" ? "me" : "maya"), segments(m.content)));
  const hello = profile.name
    ? `Welcome back, ${profile.name}! 😊 ((Senang kamu kembali!)) Let's continue learning!`
    : "Hi! I'm Maya, your personal English teacher 😊 ((Halo! Aku Maya, guru bahasa Inggris pribadimu.)) What's your name? ((Siapa namamu?))";
  setTimeout(() => {
    mayaSay(hello);
    chatLog.push({ role: "assistant", content: hello });
    saveChat();
  }, 400);
}

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("#textIn").value.trim();
  if (!t || busy) return;
  $("#textIn").value = "";
  userSays(t);
});

async function userSays(text) {
  addMsg(text, "me");
  chatLog.push({ role: "user", content: text });
  saveChat();

  busy = true;
  setStatus("berpikir…", "speaking");
  const dots = addMsg("", "maya thinking");
  dots.innerHTML = "<i></i><i></i><i></i>";

  let reply;
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatLog, profile }),
    });
    const data = await r.json();
    if (data.error === "no_key") reply = "Ups, kunci DeepSeek belum dipasang di file .env 🔑";
    else if (!r.ok) reply = "Maaf, koneksiku lagi bermasalah. Coba kirim lagi ya 🙏";
    else reply = data.reply;
  } catch {
    reply = "Maaf, aku tidak bisa terhubung. Cek internetmu ya 🙏";
  }
  dots.remove();

  // pull out the hidden profile tag
  reply = reply.replace(/\[\[PROFILE\s*(\{[\s\S]*?\})\s*\]\]/g, (_, json) => {
    try { profile = { ...profile, ...JSON.parse(json) }; } catch {}
    return "";
  }).replace(/\*\*/g, "").trim();

  chatLog.push({ role: "assistant", content: reply });
  saveChat();
  busy = false;
  mayaSay(reply);
}

/* ---------- mute ---------- */
const muteBtn = $("#btnMute");
muteBtn.setAttribute("aria-pressed", muted);
muteBtn.addEventListener("click", () => {
  muted = !muted;
  store.set("muted", muted);
  muteBtn.setAttribute("aria-pressed", muted);
  if (muted && synth) synth.cancel();
  toast(muted ? "Suara Maya dimatikan 🔇" : "Suara Maya dinyalakan 🔊");
});

/* ================= MIC: student speaks ================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;
let micLang = store.get("micLang") || "id-ID";

const langBtn = $("#btnMicLang");
const showMicLang = () => { langBtn.textContent = micLang === "id-ID" ? "ID" : "EN"; };
showMicLang();
langBtn.addEventListener("click", () => {
  micLang = micLang === "id-ID" ? "en-US" : "id-ID";
  store.set("micLang", micLang);
  showMicLang();
  toast(micLang === "id-ID" ? "Mic: Bahasa Indonesia 🇮🇩" : "Mic: English 🇬🇧");
});

$("#btnMic").addEventListener("click", () => {
  if (!SR) return toast("Mic belum didukung di browser ini. Coba Google Chrome 🙏");
  if (listening) return rec.stop();
  if (busy) return;
  if (synth) synth.cancel();
  sayToken++; mouth(false);

  rec = new SR();
  rec.lang = micLang;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => { listening = true; $("#btnMic").classList.add("on"); setStatus("mendengarkan…", "listening"); };
  rec.onresult = (e) => {
    const r = e.results[e.results.length - 1];
    $("#textIn").value = r[0].transcript;
    if (r.isFinal) {
      const t = r[0].transcript.trim();
      $("#textIn").value = "";
      if (t) userSays(t);
    }
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed") toast("Izinkan akses mikrofon dulu ya 🎙️");
    else if (e.error === "no-speech") toast("Aku tidak mendengar apa-apa. Coba lagi 🙂");
  };
  rec.onend = () => { listening = false; $("#btnMic").classList.remove("on"); if (!busy) setStatus("online"); };
  rec.start();
});

/* ---------- helpers ---------- */
function stopAll() {
  sayToken++;
  if (synth) synth.cancel();
  if (listening && rec) rec.stop();
  if ($("#mayaFace")) mouth(false);
}

let toastT;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- boot ---------- */
// Chat needs a tap first (for sound), so a fresh load always opens on home or language.
if (location.hash === "#chat") history.replaceState(null, "", "#language");
show(location.hash.slice(1) || "home");
