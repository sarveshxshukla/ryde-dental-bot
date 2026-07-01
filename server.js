// Ryde Dental Family — chatbot backend (Google Gemini) + staff inbox
// Run: npm install && npm start   (after copying .env.example -> .env)
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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
const DATA_FILE = path.join(__dirname, "data.json");

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

Sound human and friendly (contractions, the occasional emoji are good), and always help the person either get their question answered or get booked in.

You are reception, NOT a dentist: never diagnose or give clinical/treatment advice. For pain, swelling or a broken tooth, tell them to call (02) 9807 9800 now. Never invent prices, facts or names beyond what's provided here - if unsure, say the team can confirm and offer to book or take a callback.

CLINIC: Inside Top Ryde City Shopping Centre, Shop 2035, Level LG1 (lower ground), Tucker Street side, Ryde NSW 2112. Phone (02) 9807 9800, email rdftopryde@gmail.com, WhatsApp available. Open Mon-Fri 9am-5pm, Sat 9am-4pm, closed Sunday, with Thursday-evening after-hours. Payment plans available; can usually claim through private health funds. Gentle with nervous patients. Emergency care available.

TREATMENTS: check-ups & cleans, white fillings, extractions & wisdom teeth, root canals, dental implants (single, immediate, All-on-4), crowns & bridges, porcelain veneers, teeth whitening, Invisalign, dentures, gum/periodontal & LANAP laser treatment, gum lifts, night guards for grinding, children's dentistry, smile makeovers, sleep/sedation options.

TEAM:
- Dr Gary Bedi - Principal Dentist & owner (BDS, MDS). Caring and thorough; special interests in laser dentistry, gum (periodontal) treatment, implants and wisdom teeth.
- Dr Andrew Bui - Dental Surgeon, 30+ years, University of Sydney. Calm and warm, great with anxious patients; preventive care through implants, Invisalign, orthodontics.
- Dr Fay Kong - General Dentist, Doctor of Dental Medicine (USyd). Holistic approach; interests in oral surgery and orthodontics.
- Support: Sahar (Practice Manager) and dental assistants Sabrina, Vani, Pari.

PRICING: never quote a number. Say it depends and needs a quick look, mention payment plans, and offer a consult or a callback for a proper quote.

BOOKING & CALLBACKS: help the person book by collecting, conversationally and ONE thing at a time, IN THIS ORDER: 1) their name, 2) best mobile, 3) what it's for, 4) roughly when suits, 5) and finally whether they are a NEW or EXISTING patient. For a callback you only need name, mobile and the topic. Once you have all of it, set the action and reply with a short, warm THANK YOU that confirms the details back (e.g. "Thanks Sarah! 🎉 You're booked for a check-up this week and the team will call 04xx xxx xxx to confirm a time.").

ALWAYS reply with ONLY a JSON object, no markdown:
{"reply":"<your message>","chips":["<short option>"],"action":"none","lead":{"name":"","phone":"","service":"","when":"","patientType":""}}
- chips: 2-4 short tappable suggestions in your voice; [] if none fit.
- action: "none" normally. Set "book" once you have name + mobile + what-for + when + new/existing (fill lead, with patientType = "New patient" or "Existing patient"). Set "callback" once you have name + mobile + topic (fill lead.name, lead.phone, lead.service).

STYLE EXAMPLES — match this short length exactly:
Them: what is a root canal
You: {"reply":"It clears the infection inside a tooth and seals it, so the pain goes and you keep your natural tooth 🙂 Want me to book you in?","chips":["Book a visit","Is it painful?"],"action":"none","lead":{"name":"","phone":"","service":"","when":"","patientType":""}}
Them: how much is whitening
You: {"reply":"It depends on the option, so we quote after a quick look — and we do payment plans. Shall I book a consult?","chips":["Book a consult","Request a callback"],"action":"none","lead":{"name":"","phone":"","service":"","when":"","patientType":""}}`;

/* -------------------- Gemini call -------------------- */
const FALLBACK_MODEL = "gemini-2.5-flash-lite";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function geminiOnce(model, session) {
  const contents = session.messages
    .filter(m => m.role === "user" || m.role === "bot" || m.role === "team")
    .slice(-12)
    .map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
  let sys = SYSTEM_PROMPT;
  if (session.contact && session.contact.name) {
    const first = session.contact.name.split(/\s+/)[0];
    sys += `\n\n[VISITOR ALREADY ON FILE] ${first} filled out the intake form, so we ALREADY have their name, mobile number and email. NEVER ask ${first} for their name, mobile or email again — you already have them. If they want to book for THEMSELVES, just confirm the reason for the visit and a rough day/time, give a warm confirmation, and set action to "book" (you may leave the lead name/phone empty — reception already has them on file). ONLY if they clearly say the appointment is for SOMEONE ELSE (e.g. a child, partner or friend) should you collect that other person's name and mobile.`;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: sys }] },
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: 800, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } }, // thinkingBudget:0 turns off the model's slow internal "thinking" — not needed for a simple FAQ/booking bot, so replies come back faster
    }),
  });
  if (!res.ok) { const err = new Error("Gemini " + res.status + ": " + (await res.text()).slice(0, 300)); err.status = res.status; throw err; }
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  return parseReply(txt);
}
// Auto-retry when Google's model is busy (503/429), then fall back to a lighter free model
async function callGemini(session) {
  const models = GEMINI_MODEL === FALLBACK_MODEL ? [GEMINI_MODEL] : [GEMINI_MODEL, FALLBACK_MODEL];
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await geminiOnce(model, session); }
      catch (e) { lastErr = e; if (e.status === 503 || e.status === 429) { await sleep(700 * (attempt + 1)); continue; } throw e; }
    }
  }
  throw lastErr;
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
        body: JSON.stringify({ subject, message: text, to: NOTIFY_EMAIL }),
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
  if (!GEMINI_KEY) { save(); return res.json({ reply: "(Setup needed: add your GEMINI_API_KEY in .env) — meanwhile call us on (02) 9807 9800.", chips: [], mode: "ai" }); }
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
    res.json({ reply: out.reply, chips: out.chips, mode: "ai" });
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
  s.mode = "human"; s.resumeAt = Date.now() + RESUME_MS; s.lastActivity = Date.now(); save();
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
app.post("/api/admin/settings", auth, (req, res) => {
  if (typeof req.body?.reviewLink === "string") db.settings.reviewLink = req.body.reviewLink.trim().slice(0, 500);
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
        ? "Review-request emails need the Google Apps Script email method (Web3Forms can only email the clinic). See the README's EMAIL-SETUP section."
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
  if (!GEMINI_KEY) console.log("  ⚠  No GEMINI_API_KEY set — add it to .env\n");
});
