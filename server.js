// Ryde Dental Family — chatbot backend (Google Gemini) + staff inbox
// Run: npm install && npm start   (after copying .env.example -> .env)
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const GEMINI_KEYS = (process.env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean); // one or more keys (comma-separated) — each free Google project has its own quota
const GEMINI_KEY = GEMINI_KEYS[0] || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GROQ_KEY = process.env.GROQ_API_KEY || "";                          // optional free fallback when Gemini is busy — get one at console.groq.com
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const AI_READY = GEMINI_KEYS.length > 0 || !!GROQ_KEY;
const BOOKING_URL = process.env.BOOKING_URL || "https://rydedentalfamily.com.au/book-an-appointment/"; // link for the "Book a confirmed time" button
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "changeme";
const HANDBACK_MIN = parseInt(process.env.HANDBACK_MINUTES) || 5;
const RESUME_MS = HANDBACK_MIN * 60 * 1000; // Smily resumes this many minutes after the last staff reply
// --- Optional: email the chats & bookings (works on Render free; sends over HTTPS, not SMTP) ---
const NOTIFY_WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL || ""; // a Google Apps Script web-app URL (emails + logs to a Sheet)
const WEB3FORMS_KEY = process.env.WEB3FORMS_KEY || "";          // OR a free Web3Forms access key (email only)
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "rdftopryde@gmail.com";
const EMAIL_AFTER_MIN = parseInt(process.env.EMAIL_AFTER_MIN) || 10; // email a chat transcript this many minutes after it goes quiet
const EMAIL_ALL_CHATS = (process.env.EMAIL_ALL_CHATS || "false") === "true"; // default: email only bookings/callbacks (set true to also email full chat transcripts)
const NOTIFY_ON = !!(NOTIFY_WEBHOOK_URL || WEB3FORMS_KEY);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json"); // set DATA_FILE=/app/data/data.json on the VPS so leads/push survive redeploys

/* -------------------- tiny JSON store -------------------- */
let db = { sessions: {}, leads: [] };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch {}
db.sessions = db.sessions || {};
db.leads = db.leads || [];
db.contactMeta = db.contactMeta || {};                                  // per-contact notes + review-request status, keyed by phone digits
db.reviewRequests = db.reviewRequests || [];                            // log of review-request emails we've sent
db.settings = db.settings || { reviewLink: process.env.REVIEW_LINK || "" };
db.pushSubs = db.pushSubs || [];                                        // phone push subscriptions (Web Push)

/* -------------------- push notifications (Web Push / PWA) -------------------- */
// VAPID keys identify this server to the push services. Auto-generated once and saved, or set via env to pin them.
if (!db.settings.vapid) {
  db.settings.vapid = (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : webpush.generateVAPIDKeys();
}
let vapidReady = false;
try {
  webpush.setVapidDetails("mailto:" + (process.env.NOTIFY_EMAIL || "rdftopryde@gmail.com"), db.settings.vapid.publicKey, db.settings.vapid.privateKey);
  vapidReady = true;
} catch (e) { console.error("VAPID setup failed:", e.message); }
// send a push to every subscribed phone; drop subscriptions that have expired
async function pushNotify(title, body, tag) {
  if (!vapidReady || !db.pushSubs.length) return;
  const payload = JSON.stringify({ title, body, tag: tag || "rdf-alert" });
  const dead = [];
  await Promise.all(db.pushSubs.map(async (sub) => {
    try { await webpush.sendNotification(sub, payload); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead.push(sub.endpoint); }
  }));
  if (dead.length) { db.pushSubs = db.pushSubs.filter(s => !dead.includes(s.endpoint)); save(); }
}
let t = null;
const save = () => { clearTimeout(t); t = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(db), () => {}), 200); };
function getSession(id) {
  if (!db.sessions[id]) db.sessions[id] = { id, mode: "ai", resumeAt: 0, messages: [], createdAt: Date.now(), lastActivity: Date.now() };
  return db.sessions[id];
}
function maybeResume(s) {
  if (s.mode === "human" && s.resumeAt && Date.now() >= s.resumeAt) {
    s.mode = "ai"; s.resumeAt = 0;
    s.messages.push({ role: "system", text: "Smily is back online and happy to help.", ts: Date.now() });
  }
}

/* -------------------- Smily's brief (the clinic's knowledge) -------------------- */
const SYSTEM_PROMPT = `You are Smily, the warm front-desk coordinator for Ryde Dental Family, a family dental practice inside Top Ryde City Shopping Centre, Sydney. You chat with patients on the clinic website.

KEEP IT SHORT — this is the most important rule. Reply in 1-2 short sentences, never more than about 35 words. No bullet points, no lists, no headings, no preamble like "Great question". Answer warmly and get to the point, then add one short next step. If there's more to explain, OFFER to explain or to book them in — don't write a long message. (Want even shorter? lower the 35; longer, raise it.)

VOICE — sound like a warm, relaxed Australian receptionist, not a bot. Aussies like friendly, easy-going, honest and to-the-point, so be warm but never gushing, salesy or over-scripted. Use natural contractions and the odd light Aussie touch ("no worries", "happy to help", "pop in", "we'll look after you", "good on you") without overdoing it. Use AUSTRALIAN English spelling and words: recognise, organise, centre, colour, specialise, cosy, mum — never American spellings. Emojis: at most one now and then, and NEVER on anything to do with pain, fear, money or bad news — there, be genuinely gentle and caring, not breezy. Vary your wording so you never sound like a script, and always help the person either get their question answered or get booked in.

DON'T ECHO — the single biggest thing that makes a bot feel robotic is repeating back what the person just said. Confirm details ONCE, briefly, then move on. Never restate the full booking summary two messages in a row. "Perfect, Monday works" beats "So you'd like a root canal on Monday July 6th at 11am…". Trust that they remember what they told you.

ONE QUESTION AT A TIME — ask a single thing per message and wait for the answer. Never stack two questions in one reply (not "which day? and what time?"). It should feel like an easy back-and-forth, not a form.

You are reception, NOT a dentist: never diagnose or give clinical/treatment advice. For pain, swelling or a broken tooth, tell them to call (02) 9807 9800 now. Never invent prices, facts or names beyond what's provided here - if unsure, say the team can confirm and offer to book or take a callback.

CLINIC: Inside Top Ryde City Shopping Centre, Shop 2035, Level LG1 (lower ground), Tucker Street side, Ryde NSW 2112. Phone (02) 9807 9800, email rdftopryde@gmail.com, WhatsApp available. Open Mon-Fri 9am-5pm, Sat 9am-4pm, closed Sunday, with Thursday-evening after-hours. Payment plans available; can usually claim through private health funds. Gentle with nervous patients. Emergency care available.

TREATMENTS: check-ups & cleans, white fillings, extractions & wisdom teeth, root canals, dental implants (single, immediate, All-on-4), crowns & bridges, porcelain veneers, teeth whitening, Invisalign, dentures, gum/periodontal & LANAP laser treatment, gum lifts, night guards for grinding, children's dentistry, smile makeovers, sleep/sedation options.

TEAM:
- Dr Gary Bedi - Principal Dentist & owner (BDS, MDS). Caring and thorough; special interests in laser dentistry, gum (periodontal) treatment, implants and wisdom teeth.
- Dr Andrew Bui - Dental Surgeon, 30+ years, University of Sydney. Calm and warm, great with anxious patients; preventive care through implants, Invisalign, orthodontics.
- Dr Fay Kong - General Dentist, Doctor of Dental Medicine (USyd). Holistic approach; interests in oral surgery and orthodontics.
- Support: Sahar (Practice Manager) and dental assistants Sabrina, Vani, Pari.

PRICING: never quote a number. Say it depends and needs a quick look, mention payment plans, and offer a consult or a callback for a proper quote.

FREE CONSULTATION OFFER: We offer a genuinely FREE consultation for dental implants and for Invisalign. Whenever someone shows any interest in implants or Invisalign (asks about them, cost, suitability, etc.), warmly let them know the consult is on us — frame it with care, e.g. "Because we really care about getting this right for you, we offer a complimentary (free) consultation for that — so you can explore your options with zero pressure." Then invite them to book that free consult.

KEEP IT BRIEF — aim to resolve the person's question within about 4-5 replies. Answer what they asked, then stop; don't keep the chat going with extra questions once they've got their answer. Do NOT push booking on people who are just asking a question. ONLY start collecting booking details (and only then will a booking button appear) when the person clearly shows they want to book or be contacted — e.g. they say "book", "appointment", "can I come in", "how do I make a booking", or agree when you offer. If they're only asking for information, answer it and at most gently offer once ("want me to book you in?") — if they don't take it up, let it go. BOOKING & CALLBACKS: help the person book by collecting, conversationally and ONE thing at a time, IN THIS ORDER: 1) their name, 2) best mobile, 3) what it's for, 4) roughly when suits, 5) and finally whether they are a NEW or EXISTING patient. For a callback you only need name, mobile and the topic. Once you have all of it, set the action and reply with a short, warm thank-you that does NOT promise or state a specific appointment time — instead reassure them our team will reach out to confirm (e.g. "Thanks Sarah! 😊 I've passed your details to our dental care team — they'll be in touch shortly to confirm a time that suits you."). NEVER say "you're booked for [a time]" or commit to a slot; only the clinic confirms actual appointment times.

ALWAYS reply with ONLY a JSON object, no markdown:
{"reply":"<your message>","chips":["<short option>"],"action":"none","lead":{"name":"","phone":"","service":"","when":"","patientType":""}}
- chips: 2-4 short tappable suggestions in your voice; [] if none fit.
- action: "none" normally. Set "book" once you have name + mobile + what-for + when + new/existing (fill lead, with patientType = "New patient" or "Existing patient"). Set "callback" once you have name + mobile + topic (fill lead.name, lead.phone, lead.service).

STYLE EXAMPLES — match this short length and relaxed Aussie tone:
Them: what is a root canal
You: {"reply":"It clears the infection inside the tooth and seals it, so the pain settles and you keep your own tooth — and we keep it really comfortable the whole way. Want me to book you in?","chips":["Book a visit","Is it painful?"],"action":"none","lead":{"name":"","phone":"","service":"","when":"","patientType":""}}
Them: how much is whitening
You: {"reply":"It depends on the option, so we'd quote after a quick look — and no worries, we do payment plans. Want me to sort you a consult?","chips":["Book a consult","Request a callback"],"action":"none","lead":{"name":"","phone":"","service":"","when":"","patientType":""}}
Them: monday for a clean please
You: {"reply":"Perfect, Monday it is. Roughly what time of day suits you best?","chips":["Morning","Afternoon"],"action":"none","lead":{"name":"","phone":"","service":"clean","when":"Monday","patientType":""}}`;

/* -------------------- Gemini call -------------------- */
const FALLBACK_MODEL = "gemini-2.5-flash-lite";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// system prompt (+ dynamic "already on file" note) shared by every provider
function buildSystem(session) {
  if (session.contact && session.contact.name) {
    const first = session.contact.name.split(/\s+/)[0];
    // Prepended (not appended) + forceful, because it must OVERRIDE the "collect name + mobile" booking steps below.
    return (
"\u26a0\ufe0f TOP-PRIORITY RULE \u2014 THIS OVERRIDES THE BOOKING STEPS BELOW:\n" +
first + " has ALREADY completed our contact form, so we HAVE their name, mobile number and email on file.\n" +
"\u2022 NEVER ask " + first + " for their name, mobile, or email \u2014 you already have all three. Asking again is a mistake.\n" +
"\u2022 For a booking for THEMSELVES: SKIP booking steps 1 (name) and 2 (mobile) completely. Only ask what the visit is for, roughly when suits, and whether they're a new or existing patient \u2014 then set action to \"book\" and leave lead.name and lead.phone EMPTY (reception already has them).\n" +
"\u2022 For a CALLBACK for THEMSELVES: you ALREADY have their name and mobile \u2014 do NOT ask for the mobile number again. Just confirm what it's about (the topic), then set action to \"callback\" and leave lead.name and lead.phone EMPTY. A quick \"No worries, I'll get the team to call you about that \\u2014 anything in particular you'd like them to know?\" is perfect.\n" +
"\u2022 The ONLY time you may collect a fresh name + mobile is if " + first + " clearly says the appointment/callback is for a DIFFERENT person (e.g. their child, partner or friend).\n\n" +
SYSTEM_PROMPT
    );
  }
  return SYSTEM_PROMPT;
}
function convoTurns(session) {
  return session.messages.filter(m => m.role === "user" || m.role === "bot" || m.role === "team").slice(-12);
}
async function geminiOnce(model, session, key) {
  const contents = convoTurns(session).map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: buildSystem(session) }] },
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: 800, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } }, // thinkingBudget:0 turns off the model's slow internal "thinking" — not needed for a simple FAQ/booking bot, so replies come back faster
    }),
  });
  if (!res.ok) { const err = new Error("Gemini " + res.status + ": " + (await res.text()).slice(0, 300)); err.status = res.status; throw err; }
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  return parseReply(txt);
}
// Groq (OpenAI-compatible) — the free, very fast fallback used when Gemini is busy
async function groqOnce(session) {
  const messages = [{ role: "system", content: buildSystem(session) }]
    .concat(convoTurns(session).map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })));
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GROQ_KEY },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.6, max_tokens: 800, response_format: { type: "json_object" } }),
  });
  if (!res.ok) { const err = new Error("Groq " + res.status + ": " + (await res.text()).slice(0, 200)); err.status = res.status; throw err; }
  const data = await res.json();
  return parseReply(data?.choices?.[0]?.message?.content || "");
}
// Try Gemini across every key + model (retrying on busy), then fall back to Groq if configured
async function callGemini(session) {
  const models = GEMINI_MODEL === FALLBACK_MODEL ? [GEMINI_MODEL] : [GEMINI_MODEL, FALLBACK_MODEL];
  let lastErr;
  for (const key of GEMINI_KEYS) {
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { return await geminiOnce(model, session, key); }
        catch (e) { lastErr = e; if (e.status === 503 || e.status === 429) { await sleep(500 * (attempt + 1)); continue; } break; }
      }
    }
  }
  // every Gemini key/model was busy or failed → use the free Groq fallback
  if (GROQ_KEY) {
    try { return await groqOnce(session); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("No AI provider configured");
}
function parseReply(raw) {
  let s = (raw || "").trim().replace(/```json|```/g, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  const core = (a !== -1 && b !== -1 && b > a) ? s.slice(a, b + 1) : s;
  try {
    const o = JSON.parse(core);
    return {
      reply: o.reply || "Sorry, could you say that another way?",
      chips: Array.isArray(o.chips) ? o.chips.slice(0, 4) : [],
      action: o.action === "book" || o.action === "callback" ? o.action : "none",
      lead: o.lead && typeof o.lead === "object" ? o.lead : null,
    };
  } catch {
    // JSON came back incomplete/truncated — salvage just the reply text (never show raw JSON to the user)
    const m = s.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) {
      const reply = m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
      let chips = [];
      const cm = s.match(/"chips"\s*:\s*\[([^\]]*)\]/);
      if (cm) { try { chips = JSON.parse("[" + cm[1] + "]").filter(x => typeof x === "string").slice(0, 4); } catch {} }
      return { reply: reply, chips: chips, action: "none", lead: null };
    }
    return { reply: "Sorry, I had a hiccup — you can reach us on (02) 9807 9800.", chips: ["Book a visit", "Request a callback"], action: "none", lead: null };
  }
}

/* -------------------- notifications: email the chats & bookings -------------------- */
function transcriptText(s) {
  return s.messages.map(m => {
    const who = m.role === "user" ? "Patient" : m.role === "team" ? "Reception" : m.role === "system" ? "\u2014" : "Smily";
    return who + ": " + m.text;
  }).join("\n");
}
async function notify(subject, text) {
  try {
    if (WEB3FORMS_KEY) {
      await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject, from_name: "Smily \u2014 Ryde Dental Family", message: text }),
      });
    } else if (NOTIFY_WEBHOOK_URL) {
      await fetch(NOTIFY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message: text, to: (db.settings.notifyEmail || NOTIFY_EMAIL) }),
      });
    }
  } catch (e) { console.error("notify failed:", e.message); }
}
// Email an arbitrary recipient (e.g. a patient, for review requests). Needs the Google Apps Script webhook —
// Web3Forms can only email the clinic, so review requests require NOTIFY_WEBHOOK_URL.
async function emailTo(toEmail, subject, text) {
  if (!NOTIFY_WEBHOOK_URL) return { ok: false, reason: "no-webhook" };
  try {
    await fetch(NOTIFY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message: text, to: toEmail }),
    });
    return { ok: true };
  } catch (e) { console.error("emailTo failed:", e.message); return { ok: false, reason: "send-failed" }; }
}
function emailLead(s, lead, type) {
  if (!NOTIFY_ON) return;
  const label = type === "Callback" ? { e: "\ud83d\udcde New callback \u2014 ", w: "callback request" }
              : type === "Enquiry" ? { e: "\u2709\ufe0f New enquiry \u2014 ", w: "enquiry" }
              : { e: "\ud83d\udcc5 New booking \u2014 ", w: "booking" };
  const subject = label.e + lead.name;
  const body =
    "New " + label.w + " from the Smily chatbot:\n\n" +
    "Name: " + lead.name + "\n" +
    "Mobile: " + lead.phone + "\n" +
    "Email: " + (lead.email || "(not provided)") + "\n" +
    "Contacted about: " + (lead.service || "General enquiry") + "\n";
  s.emailedCount = s.messages.length; s.leadEmailed = true;
  notify(subject, body);
}
// Lazily email a chat transcript once it has gone quiet (runs whenever any request comes in)
function sweepIdle() {
  if (!NOTIFY_ON || !EMAIL_ALL_CHATS) return;
  const now = Date.now(), cutoff = EMAIL_AFTER_MIN * 60 * 1000;
  let changed = false;
  for (const id in db.sessions) {
    const s = db.sessions[id];
    if (!s.messages.some(m => m.role === "user")) continue;          // skip empty chats
    const emailed = s.emailedCount || 0;
    if (s.messages.length <= emailed) continue;                      // nothing new since last email
    if (now - s.lastActivity < cutoff) continue;                     // still active, wait
    if (!s.messages.slice(emailed).some(m => m.role === "user")) { s.emailedCount = s.messages.length; changed = true; continue; }
    s.emailedCount = s.messages.length; changed = true;
    notify("\ud83d\udcac Chat transcript \u2014 visitor " + id.slice(-4), transcriptText(s) + (s.leadEmailed ? "" : "\n\n(No booking was made in this chat.)"));
  }
  if (changed) save();
}

/* -------------------- app -------------------- */
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.end();
  next();
});
const auth = (req, res, next) => req.get("x-admin-token") === ADMIN_TOKEN ? next() : res.status(401).json({ error: "unauthorized" });

// patient -> bot
app.post("/api/chat", async (req, res) => {
  const { sessionId, message, attachment } = req.body || {};
  if (!sessionId || (!message && !attachment)) return res.status(400).json({ error: "missing fields" });
  const s = getSession(sessionId); s.lastActivity = Date.now();
  sweepIdle();
  if (attachment) s.messages.push({ role: "user", text: "Sent a file: " + String(attachment).slice(0, 120), ts: Date.now(), attach: true });
  if (message) s.messages.push({ role: "user", text: String(message).slice(0, 2000), ts: Date.now() });
  // WhatsApp-style: alert staff on EVERY visitor message, titled with their name once we've learned it
  if (s.skipNextPush) { s.skipNextPush = false; }
  else pushNotify(s.visitorName ? "\ud83d\udcac " + s.visitorName : "\ud83d\udcac New website message",
             message ? String(message).slice(0, 140) : "\ud83d\udcce Sent a file",
             "rdf-msg-" + s.id);
  maybeResume(s);
  if (s.mode === "human") { save(); return res.json({ reply: null, queued: true, mode: "human" }); }
  if (!AI_READY) { save(); return res.json({ reply: "(Setup needed: add a GEMINI_API_KEY or GROQ_API_KEY in .env) — meanwhile call us on (02) 9807 9800.", chips: [], mode: "ai" }); }
  try {
    const out = await callGemini(s);
    if (out.lead?.name) s.visitorName = out.lead.name;   // remember the name for future message alerts
    s.messages.push({ role: "bot", text: out.reply, ts: Date.now() });
    if (out.action === "book" || out.action === "callback") {
      const type = out.action === "callback" ? "Callback" : "Booking";
      // booking for someone ELSE → Gemini supplies a fresh name+phone; otherwise fall back to the details already on file
      const gaveOther = out.lead && out.lead.name && out.lead.phone;
      const name  = gaveOther ? out.lead.name  : (s.contact?.name  || out.lead?.name);
      const phone = gaveOther ? out.lead.phone : (s.contact?.phone || out.lead?.phone);
      const email = gaveOther ? (out.lead.email || "") : (s.contact?.email || "");
      if (name && phone) {
        const norm = String(phone).replace(/\D/g, "");
        const dup = db.leads.some(l => l.type === type && String(l.phone).replace(/\D/g, "") === norm && (Date.now() - l.createdAt) < 6 * 3600 * 1000);
        if (!dup) {
          const service = out.lead?.service || "General enquiry";
          const when = type === "Callback" ? "Callback requested" : (out.lead?.when || "Flexible");
          const patientType = type === "Callback" ? "\u2014" : (out.lead?.patientType || "New patient");
          db.leads.unshift({ id: "RDF-" + Date.now().toString().slice(-6), sessionId, type, name, phone, email, service, when, patientType, status: "New", createdAt: Date.now() });
          emailLead(s, { name, phone, email, service, when, patientType }, type);
          pushNotify(type === "Callback" ? "New callback \ud83d\udcde" : "New booking \ud83d\udcc5", name + (out.lead?.service ? " \u00b7 " + out.lead.service : ""), "rdf-lead");
        }
      }
    }
    save();
    const resp = { reply: out.reply, chips: out.chips, mode: "ai" };
    if (out.action === "book" || out.action === "callback") resp.cta = { label: "\ud83d\udcc5 Book an appointment", url: BOOKING_URL };
    res.json(resp);
  } catch (e) {
    console.error("Gemini error:", e.message);
    res.json({ reply: "Sorry, I'm having a moment — you can reach our team on (02) 9807 9800. Want to leave your number for a callback?", chips: ["Request a callback"], mode: "ai" });
  }
});

// patient widget polls for staff replies / resume
app.get("/api/poll", (req, res) => {
  const s = db.sessions[req.query.sessionId];
  if (!s) return res.json({ mode: "ai", resumeAt: 0, events: [] });
  maybeResume(s); sweepIdle(); save();
  const events = s.messages.filter(m => m.role === "team" || m.role === "system").map(m => ({ role: m.role, text: m.text, ts: m.ts }));
  res.json({ mode: s.mode, resumeAt: s.resumeAt, events });
});

// staff inbox data
app.get("/api/admin/data", auth, (req, res) => {
  const sessions = Object.values(db.sessions)
    .sort((a, b) => b.lastActivity - a.lastActivity).slice(0, 40)
    .map(s => ({ id: s.id, mode: s.mode, resumeAt: s.resumeAt, lastActivity: s.lastActivity, visitorName: s.visitorName || "", closed: !!s.closed, messages: s.messages }));

  // ---- analytics computed over the FULL store (not just the 40 returned above) ----
  const allSessions = Object.values(db.sessions);
  const realChats = allSessions.filter(s => s.messages.some(m => m.role === "user"));
  const now = Date.now(), dayMs = 864e5;
  const byDow = [0, 0, 0, 0, 0, 0, 0];
  realChats.forEach(s => { byDow[new Date(s.createdAt).getDay()]++; });
  const svc = {};
  db.leads.forEach(l => { const k = l.service || "General enquiry"; svc[k] = (svc[k] || 0) + 1; });
  const stats = {
    chats: realChats.length,
    chatsToday: realChats.filter(s => s.createdAt >= now - dayMs).length,
    chatsWeek: realChats.filter(s => s.createdAt >= now - 7 * dayMs).length,
    leads: db.leads.length,
    bookings: db.leads.filter(l => l.type === "Booking").length,
    callbacks: db.leads.filter(l => l.type === "Callback").length,
    enquiries: db.leads.filter(l => l.type === "Enquiry").length,
    newLeads: db.leads.filter(l => l.status === "New").length,
    humanTakeovers: allSessions.filter(s => s.messages.some(m => m.role === "team")).length,
    byDow,
    topServices: Object.entries(svc).sort((a, b) => b[1] - a[1]).slice(0, 6),
    reviewRequests: db.reviewRequests.length,
  };

  res.json({
    sessions,
    leads: db.leads.slice(0, 200),
    contactMeta: db.contactMeta,
    reviewRequests: db.reviewRequests.slice(0, 100),
    settings: db.settings,
    stats,
  });
});
// staff replies (this pauses the AI for that chat)
app.post("/api/staff/reply", auth, (req, res) => {
  const { sessionId, text } = req.body || {};
  if (!sessionId || !text) return res.status(400).json({ error: "missing" });
  const s = getSession(sessionId);
  s.messages.push({ role: "team", text: String(text).slice(0, 2000), ts: Date.now() });
  s.mode = "human"; s.resumeAt = Date.now() + (Number.isFinite(parseInt(db.settings.handbackMinutes)) ? parseInt(db.settings.handbackMinutes) : HANDBACK_MIN) * 60000; s.lastActivity = Date.now(); save();
  res.json({ ok: true });
});
// hand a chat back to the AI immediately
app.post("/api/staff/handback", auth, (req, res) => {
  const s = db.sessions[req.body?.sessionId];
  if (s) { s.mode = "ai"; s.resumeAt = 0; s.messages.push({ role: "system", text: "Smily is back online and happy to help.", ts: Date.now() }); save(); }
  res.json({ ok: true });
});
app.post("/api/admin/lead-status", auth, (req, res) => {
  const l = db.leads.find(x => x.id === req.body?.id);
  if (l) { l.status = req.body.status; save(); }
  res.json({ ok: true });
});

// mark a conversation resolved (Closed) or reopen it
app.post("/api/admin/conversation-status", auth, (req, res) => {
  const s = db.sessions[req.body?.sessionId];
  if (s) { s.closed = !!req.body.closed; save(); }
  res.json({ ok: true });
});

// save a note against a contact (keyed by their phone digits)
app.post("/api/admin/contact-note", auth, (req, res) => {
  const key = String(req.body?.key || "").replace(/\D/g, "");
  if (!key) return res.status(400).json({ error: "missing key" });
  db.contactMeta[key] = Object.assign({}, db.contactMeta[key], { notes: String(req.body?.notes || "").slice(0, 2000) });
  save(); res.json({ ok: true });
});

// save settings (currently just the Google review link)
app.post("/api/admin/conversation-delete", auth, (req, res) => {
  const sid = String(req.body?.sessionId || "");
  if (!sid) return res.status(400).json({ error: "missing sessionId" });
  db.sessions = (db.sessions || []).filter(s => s.id !== sid);
  save();
  res.json({ ok: true });
});
app.post("/api/admin/lead-delete", auth, (req, res) => {
  const id = String(req.body?.id || "");
  const before = db.leads.length;
  db.leads = db.leads.filter(l => l.id !== id);
  save();
  res.json({ ok: true, removed: before - db.leads.length });
});
app.post("/api/admin/contact-delete", auth, (req, res) => {
  const key = String(req.body?.key || "");
  if (!key) return res.status(400).json({ error: "missing key" });
  const keyOf = l => { const d = String(l.phone || "").replace(/\D/g, ""); return d || ("e:" + String(l.email || "").toLowerCase()); };
  db.leads = db.leads.filter(l => keyOf(l) !== key);
  if (db.contactMeta && db.contactMeta[key]) delete db.contactMeta[key];
  save();
  res.json({ ok: true });
});
app.post("/api/admin/leads-clear", auth, (req, res) => {
  db.leads = [];
  db.contactMeta = {};
  save();
  res.json({ ok: true });
});
app.post("/api/admin/settings", auth, (req, res) => {
  const b = req.body || {};
  if (typeof b.reviewLink === "string") db.settings.reviewLink = b.reviewLink.trim().slice(0, 500);
  if (typeof b.notifyEmail === "string") db.settings.notifyEmail = b.notifyEmail.trim().slice(0, 200);
  if (typeof b.greeting === "string") db.settings.greeting = b.greeting.trim().slice(0, 300);
  if (b.handbackMinutes !== undefined) { const m = parseInt(b.handbackMinutes); if (Number.isFinite(m) && m >= 0 && m <= 240) db.settings.handbackMinutes = m; }
  save(); res.json({ ok: true, settings: db.settings });
});

// send a Google-review-request email to a patient
app.post("/api/admin/review-request", auth, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim();
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  if (!email || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: "A valid patient email is required." });
  const link = db.settings.reviewLink;
  if (!link) return res.status(400).json({ error: "Add your Google review link in the Reviews tab first." });
  const first = name ? name.split(" ")[0] : "there";
  const subject = "Thank you for visiting Ryde Dental Family";
  const body =
    "Hi " + first + ",\n\n" +
    "Thank you for choosing Ryde Dental Family \u2014 it was lovely to see you!\n\n" +
    "If you have a moment, we'd be really grateful if you could leave us a quick Google review. It genuinely helps our clinic and other patients looking for a dentist they can trust:\n\n" +
    link + "\n\n" +
    "Thanks so much,\nThe team at Ryde Dental Family\n(02) 9807 9800";
  const r = await emailTo(email, subject, body);
  if (!r.ok) {
    return res.status(400).json({
      error: r.reason === "no-webhook"
        ? "To send review requests, the Google Apps Script email method needs switching on (Web3Forms only emails the clinic). It's a quick one-time setup \u2014 see EMAIL-SETUP in the README."
        : "Couldn't send the email \u2014 please try again."
    });
  }
  db.reviewRequests.unshift({ name, email, phone, ts: Date.now() });
  if (phone) db.contactMeta[phone] = Object.assign({}, db.contactMeta[phone], { reviewRequestedAt: Date.now() });
  save();
  res.json({ ok: true });
});

// --- Web Push endpoints (phone alerts) ---
app.get("/api/push/key", (_req, res) => res.json({ key: db.settings.vapid ? db.settings.vapid.publicKey : null }));
app.post("/api/push/subscribe", auth, (req, res) => {
  const sub = req.body?.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: "bad subscription" });
  if (!db.pushSubs.some(s => s.endpoint === sub.endpoint)) { db.pushSubs.push(sub); save(); }
  res.json({ ok: true });
});
app.post("/api/push/test", auth, async (req, res) => {
  await pushNotify("Test alert \ud83d\udd14", "Push notifications are working — you'll be alerted when a chat starts.", "rdf-test");
  res.json({ ok: true, subs: db.pushSubs.length });
});

// Fast wake-up ping (the widget calls this on page load so the server is awake by the time someone chats)
app.get("/api/ping", (_req, res) => res.json({ ok: true }));
app.get("/api/version", (_req, res) => res.json({ build: "2026-07-04-aus-voice-settings", onFileFix: true, freeConsult: true, bookingBtn: true, ausVoice: true, settingsTab: true, groqFallback: !!GROQ_KEY }));
app.get("/api/config", (_req, res) => res.json({ greeting: (db.settings && db.settings.greeting) || "" })); // public: widget reads the editable greeting

// Intake form before the conversation: capture the visitor's details up front
// intake form: capture the visitor's details up-front (before the chat) so Smily never re-asks.
// Registered on BOTH paths so a cached old widget (/api/register) and the new one (/api/start) both work.
app.post(["/api/start", "/api/register"], (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 80);
  const phone = String(req.body?.mobile || req.body?.phone || "").trim().slice(0, 40);
  const email = String(req.body?.email || "").trim().slice(0, 120);
  const message = String(req.body?.message || "").trim();
  const sessionId = req.body?.sessionId;
  if (!sessionId || !name || !phone) return res.status(400).json({ error: "Name and mobile are required." });
  const s = getSession(sessionId);
  s.visitorName = name;
  s.contact = { name, phone, email };   // on file → Smily won't ask for these again
  s.lastActivity = Date.now();
  if (req.body?.silent) { save(); return res.json({ ok: true }); }   // returning visitor: just refresh the on-file details, no new lead/email/alert
  if (!db.leads.some(l => l.sessionId === sessionId && l.type === "Enquiry")) {
    db.leads.unshift({
      id: "RDF-" + Date.now().toString().slice(-6), sessionId, type: "Enquiry",
      name, phone, email, service: message ? message.slice(0, 200) : "Website enquiry",
      when: "\u2014", patientType: "\u2014", status: "New", createdAt: Date.now(),
    });
    emailLead(s, { name, phone, email, service: message ? message.slice(0, 200) : "Website enquiry" }, "Enquiry");
  }
  s.skipNextPush = true;   // the first chat message that follows shouldn't double-alert
  pushNotify("\ud83d\udcac New enquiry \u2014 " + name, message ? message.slice(0, 140) : "started a chat", "rdf-msg-" + s.id);
  save();
  res.json({ ok: true });
});

// DIRECT booking form / early details capture -> saves a lead (no AI call). Merges if we already have this person.
app.post("/api/book", (req, res) => {
  const { sessionId, name, phone, email, service, when, patientType } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: "name and phone required" });
  const sid = sessionId || "direct_" + Date.now();
  const s = getSession(sid); s.lastActivity = Date.now();
  const norm = String(phone).replace(/\D/g, "");
  const existing = db.leads.find(l => l.sessionId === sid && l.phone.replace(/\D/g, "") === norm);
  if (existing) {
    existing.name = name || existing.name;
    if (email) existing.email = email;
    if (service && service !== "Website enquiry") existing.service = service;
    if (when) existing.when = when;
    if (patientType) existing.patientType = patientType;
  } else {
    db.leads.unshift({
      id: "RDF-" + Date.now().toString().slice(-6), sessionId: sid, type: "Booking",
      name, phone, email: email || "", service: service || "General enquiry", when: when || "Flexible",
      patientType: patientType || "New patient", status: "New", createdAt: Date.now(), direct: true,
    });
    s.messages.push({ role: "user", text: "[Sent details via the website]", ts: Date.now() });
  }
  emailLead(s, { name, phone, email: email || "", service: service || "General enquiry", when: when || "Flexible", patientType: patientType || "New patient" }, "Booking");
  pushNotify("New booking \ud83d\udcc5", name + (service ? " \u00b7 " + service : ""), "rdf-lead");
  save();
  res.json({ ok: true });
});

// intake form — capture the visitor's details up-front, before the chat starts
app.use("/", express.static(path.join(__dirname, "public")));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.listen(PORT, () => {
  console.log(`\n  Ryde Dental chatbot running on http://localhost:${PORT}`);
  console.log(`  Test widget:  http://localhost:${PORT}/`);
  console.log(`  Staff inbox:  http://localhost:${PORT}/admin   (token: ${ADMIN_TOKEN})`);
  if (!AI_READY) console.log("  ⚠  No AI key set — add GEMINI_API_KEY (and/or GROQ_API_KEY) to .env\n");
  else if (GROQ_KEY) console.log("  ✓  Groq fallback is ON (used if Gemini is busy)\n");
});
