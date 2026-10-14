/* ================= Speakuru — app.js ================= */

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Maya's brain: the local test server on this PC, or the Cloudflare Worker on the real site
const WORKER_URL = "https://speakuru-api.wolfduba.workers.dev/api/chat";
const API_URL = location.hostname === "localhost" ? "/api/chat" : WORKER_URL;

/* ---------- tiny safe storage ---------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("speakuru:" + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("speakuru:" + k, JSON.stringify(v)); } catch {} },
};
// For testing: open the site with ?reset to start again as a new student
if (new URLSearchParams(location.search).has("reset")) {
  try { Object.keys(localStorage).filter((k) => k.startsWith("speakuru:")).forEach((k) => localStorage.removeItem(k)); } catch {}
  history.replaceState(null, "", location.pathname);
}

let profile = store.get("profile") || {};   // {name, age, goal, level}
let curriculum = null;
const curriculumReady = fetch("curriculum.json").then((r) => r.json()).then((c) => (curriculum = c));

/* ---------- screens (hash routing so phone "back" works) ---------- */
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === id));
  window.scrollTo(0, 0);
  if (id === "map") renderMap();
  if (id !== "chat") stopAll();
}
function go(id) {
  const target = id === "home" ? "" : "#" + id;
  if (location.hash === target || (!location.hash && !target)) show(id);
  else location.hash = target;
}
window.addEventListener("hashchange", () => show(location.hash.slice(1) || "home"));
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); go(b.dataset.go); }));

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
  // returning student who already finished the level check → straight to lessons
  go(profile.level ? "map" : "language");
});

/* ================= LANGUAGE LISTS ================= */
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
    next();
  });
}
onPick($("#langList"), "lang", () => go("learn"));        // 1. language you speak
onPick($("#learnList"), "learnLang", () =>               // 2. language you want to learn
  profile.level ? go("map") : openChat("onboarding"));

/* ================= XP + STREAK ================= */
let xp = store.get("xp") || 0;
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function streakNow() {
  const s = store.get("streak") || { days: 0, last: null };
  const yesterday = dayKey(new Date(Date.now() - 864e5));
  return s.last === dayKey() || s.last === yesterday ? s.days : 0;
}
function touchStreak() {
  const s = store.get("streak") || { days: 0, last: null };
  const today = dayKey(), yesterday = dayKey(new Date(Date.now() - 864e5));
  if (s.last === today) return;
  s.days = s.last === yesterday ? s.days + 1 : 1;
  s.last = today;
  store.set("streak", s);
  if (s.days > 1) toast(`🔥 ${s.days} day streak!`);
}
function addXp(n) {
  xp += n;
  store.set("xp", xp);
  touchStreak();
  const p = $("#xpPop");
  p.textContent = `+${n} XP`;
  p.classList.remove("show"); void p.offsetWidth; p.classList.add("show");
}

/* ================= LESSON MAP ================= */
let tapOnly = store.get("tapOnly") === true;
let mapLevel = null;
const done = () => store.get("done") || [];

function levelIndex(id) { return curriculum.levels.findIndex((l) => l.id === id); }

// open / done / current / locked for every lesson of a level
function lessonStates(li) {
  const d = done();
  const myLi = Math.max(0, levelIndex(profile.level || "beginner"));
  const lessons = curriculum.levels[li].lessons;
  const prevDone = li === 0 || curriculum.levels[li - 1].lessons.every((l) => d.includes(l.id));
  if (li < myLi) return lessons.map((l) => (d.includes(l.id) ? "done" : "open"));
  if (li > myLi && !prevDone) return lessons.map(() => "locked");
  let foundCurrent = false;
  return lessons.map((l) => {
    if (d.includes(l.id)) return "done";
    if (!foundCurrent) { foundCurrent = true; return "current"; }
    return "locked";
  });
}

async function renderMap() {
  await curriculumReady;
  const lvl = curriculum.levels[Math.max(0, levelIndex(profile.level || "beginner"))];
  if (!mapLevel) mapLevel = lvl.id;
  const goals = { work: "💼 Work", travel: "✈️ Travel", school: "🎓 School", exam: "📝 Exam", fun: "😊 Fun" };

  $("#statXp").textContent = xp;
  $("#statStreak").textContent = streakNow();
  $("#mapHi").textContent = `Hi${profile.name ? " " + profile.name : ""}! 👋`;
  $("#mapInfo").textContent = [`Level: ${lvl.title}`, goals[profile.goal]].filter(Boolean).join(" · ");
  $("#btnTapOnly").setAttribute("aria-pressed", tapOnly);
  $("#btnTapOnly b").textContent = tapOnly ? "On" : "Off";

  $("#levelTabs").innerHTML = curriculum.levels.map((l) =>
    `<button class="${l.id === mapLevel ? "on" : ""}" data-level="${l.id}" style="--c:${l.color}">${l.title}<small>${l.cefr}</small></button>`).join("");

  const li = levelIndex(mapLevel);
  const states = lessonStates(li);
  const level = curriculum.levels[li];
  $("#path").style.setProperty("--c", level.color);
  $("#path").innerHTML = level.lessons.map((l, i) => `
    <button class="node ${states[i]}" data-id="${l.id}" style="animation-delay:${i * 40}ms">
      ${states[i] === "current" ? '<span class="start-bubble">START</span>' : ""}
      <span class="node-circle">${states[i] === "locked" ? "🔒" : states[i] === "done" ? "✅" : l.emoji}</span>
      <span class="node-text"><b>${i + 1}. ${esc(l.title)}</b><small>${esc(l.titleId)}</small></span>
    </button>`).join("");
}

$("#levelTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-level]");
  if (b) { mapLevel = b.dataset.level; renderMap(); }
});
$("#path").addEventListener("click", (e) => {
  const n = e.target.closest(".node");
  if (!n) return;
  if (n.classList.contains("locked")) return toast("🔒 Finish the lesson before first");
  unlockVoice();
  openChat("lesson", n.dataset.id);
});
$("#btnFree").addEventListener("click", () => { unlockVoice(); openChat("free"); });
$("#btnTapOnly").addEventListener("click", () => {
  tapOnly = !tapOnly;
  store.set("tapOnly", tapOnly);
  renderMap();
  toast(tapOnly ? "👆 Tap-only on: answer with buttons only" : "🎙️ Speaking & typing on");
});

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

// Say English for exercises. slow = 🐢 button. voice2 = the second person in a dialogue.
function voiceEn2() {
  const vs = synth ? synth.getVoices() : [];
  return vs.find((v) => /google uk english male/i.test(v.name))
      || vs.find((v) => v.lang.startsWith("en") && /male|david|guy|daniel/i.test(v.name) && v !== voiceEn)
      || vs.find((v) => v.lang.startsWith("en") && v !== voiceEn) || voiceEn;
}
function sayEnglish(text, { slow = false, voice2 = false, queue = false } = {}) {
  return new Promise((resolve) => {
    if (!synth) return resolve();
    if (!queue) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    const v = voice2 ? voiceEn2() : voiceEn;
    if (v) u.voice = v;
    u.rate = slow ? 0.55 : 0.88;
    if (voice2) u.pitch = 0.85;
    u.onend = u.onerror = () => resolve();
    synth.speak(u);
  });
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

/* Maya talks Indonesian; English (what the student learns) comes inside {{...}}.
   "Kata {{mother}} artinya ibu" -> [{t:"Kata ", en:false}, {t:"mother", en:true}, {t:" artinya ibu", en:false}] */
function segments(text) {
  return text.replace(/\(\(|\)\)/g, "").split(/(\{\{[\s\S]*?\}\})/).filter((p) => p.trim()).map((p) =>
    p.startsWith("{{") ? { t: p.slice(2, -2), en: true } : { t: p, en: false });
}

function segNode(s) {
  const n = document.createElement(s.en ? "b" : "span");
  if (s.en) n.className = "en";
  return n;
}
function fillBubble(bubble, segs) {
  segs.forEach((s) => {
    const n = segNode(s);
    n.textContent = s.t;
    bubble.appendChild(n);
  });
}

/* Maya says something: types the text + speaks it (English voice + Indonesian voice) */
let sayToken = 0;
function mayaSay(text) {
  const my = ++sayToken;
  const segs = segments(text);
  return new Promise((resolve) => {
    if (!segs.length) return resolve();
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

    // typing effect, segment by segment
    let si = 0, ci = 0, node = null;
    const type = () => {
      if (my !== sayToken) { bubble.textContent = ""; fillBubble(bubble, segs); bubble.classList.remove("typing"); resolve(); return; }
      if (!node) {
        node = segNode(segs[si]);
        bubble.appendChild(node);
      }
      node.textContent = segs[si].t.slice(0, ++ci);
      scrollDown();
      if (ci >= segs[si].t.length) { si++; ci = 0; node = null; }
      if (si < segs.length) setTimeout(type, 18);
      else { typeDone = true; finish(); }
    };
    type();

    if (!speechDone) {
      synth.cancel();
      const parts = segs.map((s) => ({ ...s, t: stripEmoji(s.t) })).filter((s) => /[\p{L}\p{N}]/u.test(s.t));
      if (!parts.length) { speechDone = true; finish(); return; }
      parts.forEach((s, i) => {
        const u = new SpeechSynthesisUtterance(s.t);
        u.lang = s.en ? "en-US" : "id-ID";
        const v = s.en ? voiceEn : voiceId;
        if (v) u.voice = v;
        u.rate = s.en ? 0.9 : 1.05;    // English a bit slower, easier to follow
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
function scrollDown() { const m = $("#messages"); requestAnimationFrame(() => (m.scrollTop = m.scrollHeight)); }

/* Maya's reply may end with tags like <<QUIZ {...}>> — split them from the text */
function parseReply(raw) {
  const tags = [];
  const text = raw
    // tolerant: <<TYPE {json}>>, <<TYPE [json]>, <<TYPE>> ...
    .replace(/<<?\s*([A-Z_]{4,})\s*(\{[\s\S]*?\}|\[[\s\S]*?\])?\s*>>?/g, (_, type, data) => { tags.push({ type, data: (data || "").trim() }); return ""; })
    .replace(/\[\[\s*([A-Z_]+)\s*([\s\S]*?\})?\s*\]\]/g, (_, type, data) => { tags.push({ type, data: (data || "").trim() }); return ""; })
    .replace(/\*\*/g, "").trim();
  tags.forEach((t) => { try { t.json = t.data ? JSON.parse(t.data) : null; } catch { t.json = null; } });
  return { text, tags };
}

// one conversation at a time: onboarding, free talk, or one lesson
let session = { mode: "onboarding", lessonId: null, log: [] };
let busy = false;

function findLesson(id) {
  for (const level of curriculum.levels) {
    const i = level.lessons.findIndex((l) => l.id === id);
    if (i >= 0) return { level, lesson: level.lessons[i], num: i + 1 };
  }
  return null;
}

function saveSession() {
  session.log = session.log.slice(-40);
  if (session.mode !== "lesson") store.set("chat:" + session.mode, session.log);
  store.set("profile", profile);
}

async function openChat(mode, lessonId = null) {
  await curriculumReady;
  stopAll();
  session = { mode, lessonId, log: mode === "lesson" ? [] : store.get("chat:" + mode) || [] };
  $("#messages").innerHTML = "";
  clearChoices();

  const info = lessonId ? findLesson(lessonId) : null;
  $("#chatTitle").textContent = info ? `Lesson ${info.num} · ${info.lesson.title}` : mode === "free" ? "Free talk" : "";
  $("#btnExit").hidden = mode === "onboarding";
  $(".screen-chat").classList.toggle("tap-only", tapOnly && mode !== "onboarding");
  $(".screen-chat").classList.toggle("compact", mode !== "onboarding");   // smaller Maya → more room for exercises
  micLang = mode === "onboarding" ? "id-ID" : "en-US";                    // lessons: the mic listens for English
  showMicLang();
  go("chat");

  // show the last few messages again
  session.log.filter((m) => !m.hide).slice(-6).forEach((m) => {
    if (m.role === "user") addMsg(m.show || m.content, "me");
    else fillBubble(addMsg("", "maya"), segments(parseReply(m.content).text));
  });

  if (mode === "onboarding" && !session.log.length) {
    const hello = "Halo! Aku Maya, guru bahasa Inggris pribadimu 😊 Dalam bahasa Inggris aku bilang: {{Hi! I'm Maya.}} Sekarang kamu, siapa namamu?";
    session.log.push({ role: "assistant", content: hello });
    saveSession();
    setTimeout(() => mayaSay(hello), 400);
  } else if (mode === "onboarding" && profile.level) {
    showLessonsButton();
  } else if (!session.log.length || mode === "lesson") {
    // Maya starts the lesson / free talk herself
    session.log.push({ role: "user", content: mode === "lesson" ? "[START LESSON]" : "[START FREE TALK]", hide: true });
    askMaya();
  } else {
    setTimeout(() => mayaSay(`{{Welcome back${profile.name ? ", " + profile.name : ""}!}} 😊 Yuk kita lanjut ngobrol.`), 400);
  }
}

$("#btnExit").addEventListener("click", () => go("map"));

/* student sends something (typed, spoken, tapped, or an exercise result) */
function sendUser(content, show) {
  if (busy) return;
  clearChoices();
  if (show !== null) addMsg(show || content, "me");
  session.log.push({ role: "user", content, ...(show ? { show } : {}) });
  saveSession();
  askMaya();
}

async function askMaya() {
  busy = true;
  setStatus("berpikir…", "speaking");
  const dots = addMsg("", "maya thinking");
  dots.innerHTML = "<i></i><i></i><i></i>";

  let reply;
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: session.log.map(({ role, content }) => ({ role, content })),
        profile, mode: session.mode, lessonId: session.lessonId, tapOnly: tapOnly && session.mode !== "onboarding",
      }),
    });
    const data = await r.json();
    if (data.error === "no_key") reply = "Ups, kunci DeepSeek belum dipasang 🔑";
    else if (!r.ok) reply = "Maaf, koneksiku lagi bermasalah. Coba kirim lagi ya 🙏";
    else reply = data.reply;
  } catch {
    reply = "Maaf, aku tidak bisa terhubung. Cek internetmu ya 🙏";
  }
  dots.remove();
  busy = false;

  const { text, tags } = parseReply(reply);
  const hadLevel = !!profile.level;
  tags.filter((t) => t.type === "PROFILE" && t.json).forEach((t) => { profile = { ...profile, ...t.json }; });
  session.log.push({ role: "assistant", content: reply });
  saveSession();

  await mayaSay(text);
  setStatus("online");

  let interactive = false;
  for (const t of tags) {
    if (t.type === "CHOICES" && Array.isArray(t.json)) { showChoices(t.json); interactive = true; }
    else if (t.type === "QUIZ" && t.json) { quizCard(t.json); interactive = true; }
    else if (t.type === "LISTEN" && t.json) { listenCard(t.json); interactive = true; }
    else if (t.type === "DIALOGUE" && t.json) { dialogueCard(t.json); interactive = true; }
    else if (t.type === "BUILD" && t.json) { buildCard(t.json); interactive = true; }
    else if (t.type === "SPEAK" && t.json) { speakCard(t.json); interactive = true; }
    else if (t.type === "ANSWER" && t.json) { answerCard(t.json); interactive = true; }
    else if (t.type === "LESSON_DONE") { lessonDone(); interactive = true; }
  }
  if (session.mode === "onboarding" && !hadLevel && profile.level) { showLessonsButton(); interactive = true; }
  // in tap-only mode there must always be something to tap
  if (!interactive && $(".screen-chat").classList.contains("tap-only")) showChoices(["Continue ▶️"]);
}

/* ---------- quick-reply buttons ---------- */
function showChoices(list) {
  const box = $("#choices");
  box.innerHTML = "";
  list.slice(0, 6).forEach((c) => {
    const b = document.createElement("button");
    b.textContent = c;
    b.addEventListener("click", () => sendUser(String(c)));
    box.appendChild(b);
  });
  scrollDown();
}
function clearChoices() { $("#choices").innerHTML = ""; }

/* ---------- exercise cards ---------- */
function card(cls, html) {
  const d = document.createElement("div");
  d.className = "msg ex " + cls;
  d.innerHTML = html;
  $("#messages").appendChild(d);
  scrollDown();
  return d;
}
const words = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, " ").split(/\s+/).filter(Boolean);
const playBtns = `<div class="ex-plays"><button class="ex-play" aria-label="Play">🔊</button><button class="ex-play slow" aria-label="Play slowly">🐢</button></div>`;

// tap one option → right/wrong → send result to Maya
function wireOptions(c, options, answer, describe) {
  c.querySelectorAll(".ex-options button").forEach((b) => b.addEventListener("click", () => {
    if (c.classList.contains("answered") || busy) return;
    c.classList.add("answered");
    if (synth) synth.cancel();
    const i = +b.dataset.i, ok = i === answer;
    b.classList.add(ok ? "right" : "wrong");
    c.querySelector(`[data-i="${answer}"]`).classList.add("right");
    if (ok) addXp(10);
    c.querySelectorAll(".reveal").forEach((r) => (r.hidden = false));
    setTimeout(() => sendUser(
      `[RESULT] ${describe}: student chose "${options[i]}" — ${ok ? "correct" : `wrong (right answer: "${options[answer]}")`}.`,
      `${options[i]} ${ok ? "✅" : "❌"}`), 700);
  }));
}
const optionsHtml = (options) => `<div class="ex-options">${options.map((o, i) => `<button data-i="${i}">${esc(o)}</button>`).join("")}</div>`;

// QUIZ (choose the meaning)
function quizCard(q) {
  const options = Array.isArray(q.options) ? q.options.map(String) : [];
  const answer = Number.isInteger(q.answer) ? q.answer : 0;
  if (!options.length) return;
  const c = card("quiz", `<div class="ex-label">👆 Pilih jawaban</div><div class="ex-q"></div>${optionsHtml(options)}`);
  fillBubble(c.querySelector(".ex-q"), segments(String(q.q || "")));
  wireOptions(c, options, answer, `Quiz "${q.q}"`);
}

// LISTEN (hear → choose)
function listenCard(q) {
  const options = Array.isArray(q.options) ? q.options.map(String) : [];
  const answer = Number.isInteger(q.answer) ? q.answer : 0;
  const say = String(q.say || options[answer] || "");
  if (!options.length || !say) return;
  const c = card("listen", `<div class="ex-label">🎧 Dengarkan & pilih</div>${playBtns}${optionsHtml(options)}
    <div class="ex-reveal reveal" hidden>🔊 ${esc(say)}</div>`);
  c.querySelector(".ex-play").addEventListener("click", () => sayEnglish(say));
  c.querySelector(".ex-play.slow").addEventListener("click", () => sayEnglish(say, { slow: true }));
  setTimeout(() => sayEnglish(say), 300);
  wireOptions(c, options, answer, `Listening ("${say}")`);
}

// DIALOGUE (hear 2-4 lines with 2 voices → answer a question)
function dialogueCard(q) {
  const lines = (Array.isArray(q.lines) ? q.lines : []).filter((l) => l && l.text).slice(0, 5);
  const options = Array.isArray(q.options) ? q.options.map(String) : [];
  const answer = Number.isInteger(q.answer) ? q.answer : 0;
  if (!lines.length || !options.length) return;
  const whos = [...new Set(lines.map((l) => l.who))];
  const c = card("dialogue", `<div class="ex-label">🎧 Dengarkan percakapan</div>${playBtns}
    <div class="ex-lines reveal" hidden>${lines.map((l) => `<p><b>${esc(l.who || "")}:</b> ${esc(l.text)}</p>`).join("")}</div>
    <button class="ex-show">👁️ Lihat teks</button>
    <div class="ex-q">${esc(q.q || "")}</div>${optionsHtml(options)}`);
  const play = async (slow) => {
    if (synth) synth.cancel();
    for (const l of lines) await sayEnglish(l.text, { slow, voice2: whos.indexOf(l.who) === 1, queue: true });
  };
  c.querySelector(".ex-play").addEventListener("click", () => play(false));
  c.querySelector(".ex-play.slow").addEventListener("click", () => play(true));
  c.querySelector(".ex-show").addEventListener("click", (e) => { c.querySelector(".ex-lines").hidden = false; e.target.remove(); });
  setTimeout(() => play(false), 300);
  wireOptions(c, options, answer, `Dialogue question "${q.q}"`);
}

// BUILD (hear the sentence → put word tiles in order)
function buildCard(q) {
  const clean = (t) => words(t).join(" ");
  const target = String(q.say || q.answer || "");
  const parts = target.split(/\s+/).filter(Boolean);
  if (!parts.length) return;
  const hint = q.hint || q.prompt || "";
  const tiles = [...parts, ...(Array.isArray(q.extra) ? q.extra.map(String) : [])]
    .map((w, i) => ({ w: w.replace(/[.,!?]$/, ""), i })).sort(() => Math.random() - 0.5);
  const c = card("build", `
    <div class="ex-label">🧩 Dengarkan & susun</div>${playBtns}
    ${hint ? `<button class="ex-show">💡 Lihat arti</button><div class="ex-hint" hidden>🇮🇩 ${esc(hint)}</div>` : ""}
    <div class="ex-answer"></div>
    <div class="ex-bank">${tiles.map((t) => `<button data-i="${t.i}">${esc(t.w)}</button>`).join("")}</div>
    <button class="ex-check" disabled>Cek ✓</button>`);
  c.querySelector(".ex-play").addEventListener("click", () => sayEnglish(target));
  c.querySelector(".ex-play.slow").addEventListener("click", () => sayEnglish(target, { slow: true }));
  const showBtn = c.querySelector(".ex-show");
  if (showBtn) showBtn.addEventListener("click", () => { c.querySelector(".ex-hint").hidden = false; showBtn.remove(); });
  setTimeout(() => sayEnglish(target), 300);
  const ans = c.querySelector(".ex-answer"), bank = c.querySelector(".ex-bank"), check = c.querySelector(".ex-check");
  c.addEventListener("click", (e) => {
    const t = e.target.closest(".ex-answer button, .ex-bank button");
    if (!t || c.classList.contains("answered")) return;
    (t.parentElement === bank ? ans : bank).appendChild(t);
    check.disabled = !ans.children.length;
  });
  check.addEventListener("click", () => {
    if (c.classList.contains("answered") || busy) return;
    c.classList.add("answered");
    const said = [...ans.children].map((b) => b.textContent).join(" ");
    const ok = clean(said) === clean(target);
    ans.classList.add(ok ? "right" : "wrong");
    if (!ok) ans.insertAdjacentHTML("afterend", `<div class="ex-correct">✅ ${esc(target)}</div>`);
    if (ok) addXp(15);
    setTimeout(() => sendUser(
      `[RESULT] Listen & build "${target}": student built "${said}" — ${ok ? "correct" : "wrong"}.`,
      `${said} ${ok ? "✅" : "❌"}`), 700);
  });
}

/* SPEAK (repeat after me) and ANSWER (answer by speaking).
   Each target word turns green (heard) or red (not heard well). Up to 3 tries. */
function micCard(cls, label, { question, targets }) {
  const c = card(cls, `
    <div class="ex-label">${label}</div>
    ${question ? `<div class="ex-q en-q">${esc(question)}</div>` : ""}
    ${playBtns}
    <div class="ex-targets">${targets.map((t, i) => `<div class="ex-target" data-t="${i}">${words(t).length ? t.split(/\s+/).map((w) => `<span>${esc(w)}</span>`).join(" ") : ""}</div>`).join("")}</div>
    <div class="ex-heard"></div>
    <div class="ex-row">
      <button class="ex-mic">🎙️ Tekan & bicara</button>
      <button class="ex-skip">⏭️ Tidak bisa bicara</button>
    </div>
    <div class="ex-row ex-after" hidden>
      <button class="ex-retry">🔁 Coba lagi</button>
      <button class="ex-next">Lanjut ▶️</button>
    </div>`);
  const listenText = question || targets[0];
  c.querySelector(".ex-play").addEventListener("click", () => sayEnglish(listenText));
  c.querySelector(".ex-play.slow").addEventListener("click", () => sayEnglish(listenText, { slow: true }));
  setTimeout(() => sayEnglish(listenText), 300);

  let tries = 0, last = null;
  const finish = (msg, show) => {
    if (c.classList.contains("answered")) return;
    c.classList.add("answered");
    sendUser(msg, show);
  };
  c.querySelector(".ex-skip").addEventListener("click", () => {
    if (busy) return;
    finish("[RESULT] Student skipped the speaking exercise (can't speak now).", "⏭️ Dilewati");
  });
  c.querySelector(".ex-next").addEventListener("click", () => last && finish(last.msg, last.show));
  const start = () => {
    if (c.classList.contains("answered") || busy) return;
    if (!SR) return toast("Mic belum didukung di browser ini. Coba Google Chrome 🙏");
    const btn = c.querySelector(".ex-mic");
    c.querySelector(".ex-after").hidden = true;
    c.querySelector(".ex-row").hidden = false;
    listen("en-US", {
      onStart: () => { btn.classList.add("on"); btn.textContent = "🎙️ Mendengarkan…"; },
      onText: (t) => { c.querySelector(".ex-heard").textContent = "“" + t + "”"; },
      onEnd: (heard) => {
        btn.classList.remove("on"); btn.textContent = "🎙️ Tekan & bicara";
        if (!heard) return;
        tries++;
        const got = words(heard);
        // pick the suggested answer closest to what was said
        let best = 0, bestScore = -1;
        targets.forEach((t, i) => {
          const w = words(t), s = w.filter((x) => got.includes(x)).length / (w.length || 1);
          if (s > bestScore) { bestScore = s; best = i; }
        });
        c.querySelectorAll(".ex-target").forEach((el, i) => {
          el.classList.toggle("dim", i !== best);
          el.querySelectorAll("span").forEach((sp) => {
            if (i !== best) return sp.className = "";
            sp.className = words(sp.textContent).every((x) => got.includes(x)) ? "ok" : "miss";
          });
        });
        const missed = [...c.querySelectorAll(`.ex-target[data-t="${best}"] .miss`)].map((s) => s.textContent);
        const ok = bestScore >= 0.7;
        const target = targets[best];
        last = {
          msg: `[RESULT] ${question ? `Answer by speaking to "${question}"` : `Repeat "${target}"`}: student said "${heard}" — ${ok ? "good" : "needs practice"} (${Math.round(bestScore * 100)}% of words heard${missed.length ? `; not heard well: ${missed.join(", ")}` : ""}).`,
          show: `🎙️ ${heard} ${ok ? "✅" : "🔁"}`,
        };
        if (ok) { addXp(15); return setTimeout(() => finish(last.msg, last.show), 900); }
        if (tries >= 3) return setTimeout(() => finish(last.msg, last.show), 900);
        c.querySelector(".ex-row").hidden = true;
        c.querySelector(".ex-after").hidden = false;
      },
    });
  };
  c.querySelector(".ex-mic").addEventListener("click", start);
  c.querySelector(".ex-retry").addEventListener("click", start);
}
function speakCard(q) {
  const text = String(q.text || "");
  if (text) micCard("speak", "🗣️ Ulangi setelah aku", { targets: [text] });
}
function answerCard(q) {
  const options = (Array.isArray(q.options) ? q.options : []).map(String).filter(Boolean).slice(0, 3);
  if (q.q && options.length) micCard("answer", "💬 Jawab dengan bicara", { question: String(q.q), targets: options });
}

function lessonDone() {
  const d = done();
  const first = !d.includes(session.lessonId);
  if (first) { d.push(session.lessonId); store.set("done", d); }
  addXp(50);
  const c = card("finish", `
    <div class="finish-emoji">🎉</div>
    <b>Pelajaran selesai!</b>
    <small>+50 XP · 🔥 ${streakNow()} day streak</small>
    <button class="ex-check">Kembali ke pelajaran ▶️</button>`);
  c.querySelector("button").addEventListener("click", () => go("map"));
}

function showLessonsButton() {
  const c = card("finish", `
    <div class="finish-emoji">🚀</div>
    <b>Pelajaranmu sudah siap!</b>
    <small>Level: ${esc(profile.level)}</small>
    <button class="ex-check">Lihat pelajaranku ▶️</button>`);
  c.querySelector("button").addEventListener("click", () => { mapLevel = null; go("map"); });
}

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("#textIn").value.trim();
  if (!t || busy) return;
  $("#textIn").value = "";
  sendUser(t);
});

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

// one-shot speech recognition, used by the chat mic and by SPEAK exercises
function listen(lang, { onStart, onText, onEnd }) {
  if (listening) { rec.stop(); return; }
  if (synth) synth.cancel();
  sayToken++; mouth(false);
  let finalText = "";
  rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onstart = () => { listening = true; setStatus("mendengarkan…", "listening"); onStart && onStart(); };
  rec.onresult = (e) => {
    const r = e.results[e.results.length - 1];
    onText && onText(r[0].transcript);
    if (r.isFinal) finalText = r[0].transcript.trim();
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed") toast("Izinkan akses mikrofon dulu ya 🎙️");
    else if (e.error === "no-speech") toast("Aku tidak mendengar apa-apa. Coba lagi 🙂");
  };
  rec.onend = () => { listening = false; if (!busy) setStatus("online"); onEnd && onEnd(finalText); };
  rec.start();
}

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
  if (busy) return;
  const btn = $("#btnMic");
  listen(micLang, {
    onStart: () => btn.classList.add("on"),
    onText: (t) => { $("#textIn").value = t; },
    onEnd: (t) => { btn.classList.remove("on"); $("#textIn").value = ""; if (t) sendUser(t); },
  });
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
// The chat needs a tap first (for sound), so a fresh load never opens straight into it.
if (location.hash === "#chat") history.replaceState(null, "", profile.level ? "#map" : "#language");
show(location.hash.slice(1) || "home");
