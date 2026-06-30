import { useState, useRef, useEffect } from "react";
import {
  Mic, Paperclip, Send, Phone, PhoneCall, CalendarCheck, Clock, User,
  LayoutDashboard, ArrowLeft, CheckCircle2, Sparkles, AlertCircle, X,
  ChevronRight, Users, Inbox, MessageCircle, Headphones, FileText, RotateCcw
} from "lucide-react";

/* ================================================================== */
/*  Brand tokens                                                       */
/* ================================================================== */
const C = {
  ink: "#0F2E2E", teal: "#0E5A57", tealDeep: "#0A3F3D", tealSoft: "#157E79",
  mint: "#EAF4F2", mintSoft: "#F4FAF8", coral: "#F2615A", coralDeep: "#DC4F49",
  coralSoft: "#FFEDEB", amber: "#9A6B00", amberSoft: "#FFF4DE", line: "#DCEAE7",
  muted: "#5B7472", bg: "#EDF3F1", white: "#FFFFFF", green: "#0B6B4A", greenSoft: "#DDF3EA",
};
const RESUME_MS = 45000; // demo: 45s. Production: ~1 hour.

const SERVICE_CHIPS = ["Check-up & clean", "Tooth pain", "Whitening", "Implants", "Invisalign", "Something else"];
const WHEN_CHIPS = ["As soon as possible", "This week", "Next week", "I'm flexible"];

/* ================================================================== */
/*  KNOWLEDGE BASE — every answer pre-loaded, no AI API needed         */
/* ================================================================== */
const KB = [
  { id: "greeting", keys: ["hi", "hello", "hey", "heya", "hiya", "yo", "hai", "good morning", "good afternoon", "good evening"],
    answer: "Hey there! 😊 I can tell you about any of our treatments, costs or opening hours — or get you booked in. What can I help with?",
    chips: ["Book a visit", "Request a callback", "Our treatments", "Opening hours"] },
  { id: "thanks", keys: ["thanks", "thank", "thank you", "ty", "cheers", "thx", "appreciate"],
    answer: "Anytime! 😊 Anything else I can help with — a treatment, costs, or getting you booked in?",
    chips: ["Book a visit", "Request a callback", "No, that's all"] },
  { id: "bye", keys: ["bye", "goodbye", "no thanks", "no thank you", "that's all", "thats all", "nothing else", "no im good", "im good"],
    answer: "No worries at all — take care of that smile, and we're here whenever you need us. 👋", chips: [] },
  { id: "services", keys: ["services", "service", "treatments", "treatment", "what do you offer", "what do you do", "options", "what can you do"],
    answer: "We do it all under one roof — everyday check-ups & cleans, fillings and kids' dentistry, plus cosmetic work like whitening, veneers and Invisalign, and bigger treatments like implants, root canals and gum care. What are you most interested in? 😊",
    chips: ["Check-up & clean", "Teeth whitening", "Implants", "Invisalign", "Tooth pain"] },

  { id: "emergency", keys: ["emergency", "urgent", "knocked out", "knocked-out", "broken tooth", "broke a tooth", "broke my tooth", "swelling", "swollen", "abscess", "bleeding", "throbbing", "can't sleep", "cant sleep", "really sore", "severe"],
    answer: "Sounds urgent — I'm sorry you're dealing with that. For pain, swelling or a broken/knocked-out tooth, please call us straight away on (02) 9807 9800 and we'll do our best to see you today. Want me to take your number for a quick callback too?",
    chips: ["Request a callback", "Call (02) 9807 9800", "Book a visit"], priority: 100 },
  { id: "toothache", keys: ["toothache", "tooth ache", "pain", "hurts", "hurting", "sore tooth", "aching", "sensitive", "ache", "painful tooth"],
    answer: "Sorry you're in pain — that's worth getting looked at quickly before it gets worse. If it's severe or there's any swelling, best to call us now on (02) 9807 9800. Otherwise I can book you in or arrange a callback — which would you prefer?",
    chips: ["Book a visit", "Request a callback", "It's severe"], priority: 50, topic: "Emergency / tooth pain" },
  { id: "painfree", keys: ["does it hurt", "is it painful", "will it hurt", "pain free", "painless", "numb", "anaesthetic", "anesthetic", "scared it hurts"],
    answer: "We keep you nice and numb so you're comfortable the whole way through, and we check in with you constantly. Honestly, most people tell us afterwards it was easier than they expected. Want me to book you in?",
    chips: ["Book a visit", "Request a callback"] },
  { id: "nervous", keys: ["nervous", "anxious", "anxiety", "scared", "afraid", "hate the dentist", "phobia", "terrified", "dread"],
    answer: "You're in good company — so many of our patients feel exactly the same, especially before the first visit. We go slowly, explain everything before we do it, and there's no judgement here at all. Would a gentle check-up be a good place to start?",
    chips: ["Book a gentle visit", "Request a callback", "Tell me what to expect"] },

  { id: "rootcanal", keys: ["root canal", "rootcanal", "rct", "root canals"],
    answer: "A root canal clears out the infected or inflamed tissue inside a tooth, then cleans and seals it — so it takes the pain away and saves your natural tooth, usually over one or two visits. It's far comfier than its reputation these days! 🦷",
    chips: ["Book a visit", "Is it painful?", "Request a callback"], topic: "Root canal" },
  { id: "implant", keys: ["implant", "implants", "missing tooth", "missing teeth", "replace a tooth", "replace tooth", "lost a tooth", "gap in teeth"],
    answer: "A dental implant is a small titanium post we place in the jaw to replace a missing tooth's root, topped with a natural-looking crown — it looks and works just like a real tooth and lasts for years. Great for filling a gap for good. 😊",
    chips: ["Book a consult", "How much is it?", "Request a callback"], topic: "Dental implants" },
  { id: "allon4", keys: ["all on 4", "all-on-4", "all on four", "allon4", "full arch", "full mouth", "no teeth", "all my teeth"],
    answer: "All-on-4 gives you a full set of fixed teeth supported by just four implants — a permanent, comfortable alternative to dentures when most or all of your teeth are missing. No slipping, no taking them out. Want to chat it through with the dentist?",
    chips: ["Book a consult", "Request a callback"], topic: "Dental implants" },
  { id: "veneers", keys: ["veneer", "veneers", "porcelain veneer"],
    answer: "Veneers are thin custom shells we bond to the front of your teeth to fix chips, gaps, stains or shape — a quick way to an even, brighter smile that still looks natural. Lots of our patients go this route before a big event. ✨",
    chips: ["Book a visit", "Teeth whitening?", "Request a callback"], topic: "Veneers / smile makeover" },
  { id: "invisalign", keys: ["invisalign", "braces", "aligner", "aligners", "straighten", "straightening", "crooked", "gap teeth", "orthodontic", "clear aligners"],
    answer: "Invisalign straightens your teeth using clear, removable aligners instead of metal braces — they're nearly invisible, and you pop them out to eat and brush. Most people can't even tell you're wearing them. Want me to book a consult to see if you're suited?",
    chips: ["Book a consult", "How much is it?", "Request a callback"], topic: "Invisalign / braces" },
  { id: "whitening", keys: ["whitening", "whiten", "bleach", "brighten", "yellow teeth", "white teeth", "stains", "stained teeth", "discoloured"],
    answer: "Our professional whitening lifts stains and brightens your smile several shades — you can do it in-chair for a fast result, or with a custom take-home kit. Much stronger and safer than the over-the-counter stuff. Shall I book you in? 😁",
    chips: ["Book a visit", "How much is it?", "Request a callback"], topic: "Teeth whitening" },
  { id: "crown", keys: ["crown", "cap", "crowns"],
    answer: "A crown is a custom cap that covers and protects a cracked, weak or heavily filled tooth, bringing back its shape and strength so you can chew normally again. We match it to your natural teeth. Want to come in for a look?",
    chips: ["Book a visit", "Request a callback"], topic: "Crown & bridge" },
  { id: "bridge", keys: ["bridge", "bridges", "bridgework"],
    answer: "A bridge fills the gap from a missing tooth by anchoring a natural-looking false tooth to the teeth either side — a fixed option that restores your smile and your bite. Happy to talk through whether a bridge or an implant suits you best.",
    chips: ["Book a visit", "Implant instead?", "Request a callback"], topic: "Crown & bridge" },
  { id: "filling", keys: ["filling", "fillings", "cavity", "cavities", "decay", "hole in tooth", "hole in my tooth"],
    answer: "A white filling repairs decay or a small chip with a tooth-coloured material that blends right in — no silver or metal, so no one can tell. Quick and usually done in one visit. Want me to book you in to get it sorted?",
    chips: ["Book a visit", "Request a callback"], topic: "White fillings" },
  { id: "extraction", keys: ["extraction", "pull tooth", "pull a tooth", "remove tooth", "take out", "wisdom tooth", "wisdom teeth", "tooth removed", "extract"],
    answer: "If a tooth's too damaged or a wisdom tooth's causing trouble, we remove it gently with proper numbing so you stay comfortable, and we'll talk you through aftercare. If it's sore right now, best to get in soon. Shall I book you?",
    chips: ["Book a visit", "Request a callback", "It's really sore"], topic: "Wisdom tooth / extraction" },
  { id: "dentures", keys: ["denture", "dentures", "false teeth", "plate", "removable teeth"],
    answer: "Dentures are custom-made removable replacements for missing teeth — full or partial — designed to fit comfortably and look natural so you can eat and smile with confidence. We take the time to get the fit right. Want to come in for a chat?",
    chips: ["Book a visit", "Implants instead?", "Request a callback"], topic: "Dentures" },
  { id: "gum", keys: ["gum", "gums", "bleeding gums", "gum disease", "periodontal", "lanap", "laser gum", "receding gums", "gum treatment", "sore gums"],
    answer: "Sounds like it could be the gums — bleeding when you brush can be an early sign of gum disease, which is very treatable when caught early. We offer gentle laser (LANAP) treatment that cleans below the gumline with far less cutting than traditional surgery. Worth getting checked — shall I book you in?",
    chips: ["Book a visit", "Request a callback", "Is it serious?"], topic: "Gum / laser treatment" },
  { id: "gummy", keys: ["gummy smile", "gum lift", "gum contouring", "too much gum", "gums show"],
    answer: "If you feel like too much gum shows when you smile, a gum lift gently reshapes the gumline to balance things out — a small change that makes a big difference. Happy to show you what's possible at a consult.",
    chips: ["Book a consult", "Request a callback"], topic: "Gum / laser treatment" },
  { id: "grinding", keys: ["grinding", "grind", "clench", "clenching", "night guard", "mouthguard", "splint", "jaw pain", "jaw clicking", "headache", "occlusal"],
    answer: "Grinding or clenching at night can wear your teeth down and leave you with jaw pain or headaches — a custom night guard cushions everything so you wake up comfortable. We mould it to fit just you. Want me to book you in for one?",
    chips: ["Book a visit", "Request a callback"], topic: "Night guard" },
  { id: "children", keys: ["kid", "kids", "child", "children", "my son", "my daughter", "paediatric", "pediatric", "toddler", "baby teeth", "childrens"],
    answer: "We love seeing little ones — our kids' visits are gentle and relaxed to keep them comfortable and build good habits early. We're a family practice, so we look after the whole household. Shall I book your child in for a check-up? 😊",
    chips: ["Book a visit", "Opening hours", "Request a callback"], topic: "Children's dentist" },
  { id: "checkup", keys: ["check up", "checkup", "check-up", "clean", "cleaning", "scale", "polish", "exam", "routine", "general dentist", "general dentistry"],
    answer: "A check-up & clean is a routine exam plus a professional scale-and-polish to remove plaque and tartar and catch anything early — we recommend one about every six months. Easy way to keep things healthy. Want me to book you in?",
    chips: ["Book a visit", "How much is it?", "Request a callback"], topic: "General check-up & clean" },
  { id: "makeover", keys: ["smile makeover", "makeover", "cosmetic", "improve my smile", "better smile", "fix my smile", "perfect smile"],
    answer: "A smile makeover combines a few treatments — like whitening, veneers or straightening — into one plan tailored to the smile you're after. The best first step is a quick consult so the dentist can map it out with you. Shall I set that up? ✨",
    chips: ["Book a consult", "Request a callback"], topic: "Veneers / smile makeover" },

  { id: "hours", keys: ["hours", "open", "opening", "timing", "time", "times", "what time", "close", "closing", "saturday", "sunday", "weekend", "thursday", "after hours", "evening", "late", "open today"],
    answer: "We're open Mon–Fri 9am–5pm and Sat 9am–4pm (closed Sundays), plus Thursday evenings for after-hours if you work during the day. When would suit you and I'll book you in?",
    chips: ["Book a visit", "Where are you?", "Request a callback"] },
  { id: "location", keys: ["where", "location", "address", "located", "find you", "directions", "parking", "park", "get there", "map", "suburb", "how do i get"],
    answer: "You'll find us inside Top Ryde City Shopping Centre — Shop 2035, Level LG1 (lower ground), on the Tucker Street side, Ryde NSW 2112. Super handy if you're already there shopping! Want me to book you in?",
    chips: ["Book a visit", "Opening hours", "Request a callback"] },
  { id: "contact", keys: ["phone number", "your number", "call you", "contact", "email", "whatsapp", "reach you", "get in touch", "contact details"],
    answer: "You can reach us on (02) 9807 9800, email rdftopryde@gmail.com, or message us on WhatsApp — whatever's easiest. Or I can have the team call you, just say the word. 😊",
    chips: ["Request a callback", "Book a visit", "Opening hours"] },
  { id: "price", keys: ["price", "cost", "how much", "fee", "fees", "charge", "charges", "expensive", "quote", "pricing", "rates", "cheap"],
    answer: "Prices really depend on what you need — every mouth's different, so we give you a proper quote after a quick look rather than guessing. The good news is we offer payment plans so you can spread the cost. Want me to book a consult, or have the team call you with details?",
    chips: ["Payment plans", "Book a consult", "Request a callback"], boost: 5 },
  { id: "payment", keys: ["payment plan", "payment plans", "finance", "instalment", "installment", "afford", "insurance", "health fund", "hicaps", "claim", "medicare", "private health"],
    answer: "We keep things affordable with payment plans so you don't have to pay it all upfront, and we can usually help you claim through your private health fund — just bring your card. The team can confirm the details for your situation. Shall I book you in?",
    chips: ["Book a visit", "Request a callback"] },
  { id: "newpatient", keys: ["new patient", "first visit", "first appointment", "never been", "what to expect", "what happens", "first time"],
    answer: "Welcome — we love meeting new patients! Your first visit is a relaxed check-up and clean where the dentist gets to know your teeth and answers any questions, no rush. Just bring any health fund card if you have one. Shall I book you in? 😊",
    chips: ["Book a visit", "Opening hours", "Request a callback"] },
  { id: "offers", keys: ["offer", "offers", "deal", "deals", "discount", "promotion", "special", "specials"],
    answer: "We run special offers from time to time — the team can let you know exactly what's on at the moment. Want me to have someone give you a quick call with the latest, or shall I book you in?",
    chips: ["Request a callback", "Book a visit"] },


  { id: "team", keys: ["team", "dentist", "dentists", "doctor", "doctors", "staff", "who are you", "who works", "meet the team", "your dentist", "qualified"],
    answer: "We've got a brilliant team — Dr Gary Bedi (our principal, big on gum care, implants and lasers), Dr Andrew Bui (30+ years' experience and lovely with nervous patients), and Dr Fay Kong (a caring, holistic general dentist), plus our wonderful support crew led by practice manager Sahar. Anyone in particular you'd like to see? 😊",
    chips: ["Dr Gary Bedi", "Dr Andrew Bui", "Dr Fay Kong", "Book a visit"], topic: "General check-up & clean" },
  { id: "dr_bedi", keys: ["bedi", "dr bedi", "gary bedi", "gary", "principal", "owner"],
    answer: "Dr Gary Bedi is our principal dentist and the practice owner (B.D.S, M.D.S) — known for being really caring and thorough. His special interests are laser dentistry, gum (periodontal) treatment, implants and wisdom teeth, and he's big on care that's gentle and affordable. Would you like to book in with him? 😊",
    chips: ["Book with Dr Bedi", "Gum / laser treatment", "Request a callback"] },
  { id: "dr_bui", keys: ["bui", "dr bui", "andrew", "andrew bui"],
    answer: "Dr Andrew Bui brings over 30 years of experience and a wonderfully calm, warm manner — a University of Sydney graduate who's especially great with nervous patients. He covers everything from preventive care to implants, Invisalign and orthodontics. Shall I book you in to see him?",
    chips: ["Book with Dr Bui", "I'm a bit nervous", "Request a callback"] },
  { id: "dr_kong", keys: ["kong", "dr kong", "fay", "fay kong", "female dentist", "lady dentist"],
    answer: "Dr Fay Kong is a caring general dentist with a Doctor of Dental Medicine from the University of Sydney, and she takes a lovely holistic approach — looking after your overall wellbeing, not just your teeth. She also has interests in oral surgery and orthodontics. Want me to book you in with her?",
    chips: ["Book with Dr Kong", "Check-up & clean", "Request a callback"] },
  { id: "book", keys: ["book", "booking", "appointment", "appointments", "appoint", "schedule", "reserve", "make an appointment", "book in", "book me", "see a dentist", "come in", "get in"], action: "book" },
  { id: "callback", keys: ["callback", "call me", "call back", "call me back", "ring me", "phone me", "have someone call", "someone call", "give me a call"], action: "callback" },
  { id: "human", keys: ["human", "real person", "receptionist", "talk to someone", "speak to someone", "agent", "speak to a person", "real human", "staff member", "talk to a person"], action: "callback" },
];
const FALLBACK = {
  answer: "That's a good one — I want to make sure you get the right answer, so let me have one of our team help you out. Can I grab your name and number for a quick callback? Or I'm happy to book you a visit. 😊",
  chips: ["Request a callback", "Book a visit", "Opening hours"],
};


/* ================================================================== */
/*  AI fallback (hybrid) — only fires when the rules can't answer.     */
/*  DEMO calls Claude (free here). PRODUCTION: swap to Gemini free tier */
/*  endpoint with your key (server-side). Same idea, same prompt.      */
/* ================================================================== */
const AI_SYSTEM = `You are Smily, the warm front-desk coordinator at Ryde Dental Family, a family dental practice inside Top Ryde City Shopping Centre, Sydney. Answer the patient's question in 1-3 short, warm, natural sentences (contractions, the odd emoji are good), then gently nudge toward booking a visit or a callback. You are reception, NOT a dentist - never diagnose or give clinical/treatment advice; for pain or swelling tell them to call (02) 9807 9800. Never invent facts, prices or names beyond what's below - if you don't know, say the team can confirm and offer to book.

CLINIC: Inside Top Ryde City Shopping Centre, Shop 2035, Level LG1 (lower ground), Tucker Street side, Ryde NSW 2112. Phone (02) 9807 9800, email rdftopryde@gmail.com, on WhatsApp. Open Mon-Fri 9am-5pm, Sat 9am-4pm, closed Sunday, plus Thursday evening after-hours. Payment plans available, and we can usually help claim through private health funds. Family practice, gentle with nervous patients. Emergency care available.

TREATMENTS: check-ups & cleans, white fillings, extractions & wisdom teeth, root canals, dental implants (single, immediate, All-on-4), crowns & bridges, porcelain veneers, teeth whitening, Invisalign, dentures, gum/periodontal & LANAP laser treatment, gum lifts, night guards for grinding, children's dentistry, smile makeovers, and sleep/sedation options.

THE TEAM:
- Dr Gary Bedi - Principal Dentist and owner (B.D.S, M.D.S). Caring and thorough; special interests in laser dentistry, gum (periodontal) treatment, implants and wisdom teeth; focused on gentle, affordable care.
- Dr Andrew Bui - Dental Surgeon, 30+ years' experience, University of Sydney graduate. Calm and warm, especially good with anxious patients; covers preventive care through to implants, Invisalign and orthodontics.
- Dr Fay Kong - General Dentist, Doctor of Dental Medicine (University of Sydney). Holistic approach; interests in oral surgery and orthodontics.
- Support team: Sahar (Practice Manager), plus dental assistants Sabrina, Vani and Pari.

Keep it brief and human. Always make booking easy.`;

async function callAI(base) {
  const history = base.filter((m) => m.role === "user" || m.role === "bot" || m.role === "team").slice(-8)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 300, system: AI_SYSTEM, messages: history }),
  });
  const data = await res.json();
  const txt = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return txt || "I'm not totally sure on that one, but our team can help - want me to take your number for a quick callback?";
}

function isQuestion(t) {
  const s = t.toLowerCase();
  return /\?/.test(s) || /\b(tell me|what|whats|how|why|who|where|when|which|do you|does|can you|could you|is it|are you|about|explain|details|info|cost|price|how much|recommend|best|good with|suited)\b/.test(s);
}

/* ================================================================== */
/*  Matching engine (pure)                                             */
/* ================================================================== */
function normalize(s) { return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function scoreIntent(intent, text, tokens) {
  let sc = 0;
  for (const k of intent.keys) {
    if (k.includes(" ")) { if (text.includes(k)) sc += k.length; }
    else if (tokens.has(k)) sc += k.length;
  }
  return sc > 0 ? sc + (intent.boost || 0) : 0;
}
function matchIntent(raw) {
  const text = normalize(raw); const tokens = new Set(text.split(" "));
  let best = null, bestScore = 0;
  for (const intent of KB) {
    const sc = scoreIntent(intent, text, tokens);
    if (sc > bestScore || (sc === bestScore && sc > 0 && (intent.priority || 0) > (best?.priority || 0))) { bestScore = sc; best = intent; }
  }
  return bestScore > 0 ? best : null;
}
function bestTopic(raw) {
  const text = normalize(raw); const tokens = new Set(text.split(" "));
  let topic = null, bestScore = 0;
  for (const intent of KB) {
    if (!intent.topic) continue;
    const sc = scoreIntent(intent, text, tokens);
    if (sc > bestScore) { bestScore = sc; topic = intent.topic; }
  }
  return topic;
}

/* ================================================================== */
/*  Conversational flows (pure)                                        */
/* ================================================================== */
const firstName = (n) => (n ? String(n).trim().split(/\s+/)[0] : "there");
const isPhone = (s) => String(s).replace(/\D/g, "").length >= 6;

const FLOWS = {
  booking: { steps: [
    { key: "name", prompt: () => "Lovely! What's your name?" },
    { key: "phone", prompt: (d) => `Thanks ${firstName(d.name)} — what's the best mobile number for you?`, validate: isPhone, errorPrompt: "That doesn't look quite right — mind popping your mobile in again?" },
    { key: "service", prompt: () => "And what's it for?", chips: SERVICE_CHIPS, skipIf: (d) => !!d.service },
    { key: "when", prompt: () => "When suits you best?", chips: WHEN_CHIPS },
    { key: "patientType", prompt: () => "Last thing — are you a new patient, or have you visited us before?", chips: ["New patient", "Existing patient"] },
  ]},
  callback: { steps: [
    { key: "name", prompt: () => "Of course — what's your name?" },
    { key: "phone", prompt: (d) => `Thanks ${firstName(d.name)}! What's the best number to reach you on?`, validate: isPhone, errorPrompt: "Hmm, that doesn't look like a number — try again?" },
    { key: "service", prompt: () => "Anything in particular it's about?", chips: ["General enquiry", "Skip"], skipIf: (d) => !!d.service, allowSkip: true },
  ]},
};
function nextAskable(steps, from, data) {
  for (let i = from; i < steps.length; i++) {
    const s = steps[i];
    if (s.skipIf && s.skipIf(data)) continue;
    if (data[s.key] !== undefined && data[s.key] !== "") continue;
    return i;
  }
  return -1;
}
function makeLead(data, base, type) {
  return {
    id: "RDF-" + Math.floor(1043 + Math.random() * 900), type,
    name: data.name || "—", phone: data.phone || "—", email: "",
    service: data.service && data.service !== "" && !/^skip$/i.test(data.service) ? data.service : "General enquiry",
    preferred: type === "Callback" ? "Callback requested" : (data.when || "Flexible"),
    patientType: type === "Callback" ? "—" : (data.patientType || "New patient"),
    status: "New", createdAt: Date.now(),
    transcript: base.filter((m) => ["user", "bot", "team"].includes(m.role)).map((m) => ({ role: m.role, text: m.text })),
  };
}
function completeFlow(type, data, base) {
  const lead = makeLead(data, base, type === "callback" ? "Callback" : "Booking");
  const f = firstName(data.name);
  const text = type === "callback"
    ? `Done, ${f} 😊 I've popped you down for a callback${lead.service !== "General enquiry" ? ` about ${lead.service.toLowerCase()}` : ""} — the team will ring ${data.phone} shortly. Anything else in the meantime?`
    : `Beautiful, thanks ${f}! 🎉 I've sent your request through — the team will call you on ${data.phone} to lock in a time. Anything else while you're here?`;
  return { messages: [...base, { role: "bot", text, chips: ["Opening hours", "Where are you?", "No, that's all"] }, { role: "confirm", booking: lead }], flow: null, lead };
}
function startFlow(type, base, data) {
  const steps = FLOWS[type].steps;
  const i = nextAskable(steps, 0, data);
  if (i === -1) return completeFlow(type, data, base);
  const step = steps[i];
  return { messages: [...base, { role: "bot", text: typeof step.prompt === "function" ? step.prompt(data) : step.prompt, chips: step.chips || [] }], flow: { type, idx: i, data } };
}
function advanceFlow(flow, raw, base) {
  const steps = FLOWS[flow.type].steps; const step = steps[flow.idx];
  if (/^(cancel|stop|nevermind|never mind|nvm|forget it)$/i.test(raw.trim()))
    return { messages: [...base, { role: "bot", text: "No worries, I've stopped that. What else can I help with? 😊", chips: ["Book a visit", "Request a callback", "Opening hours"] }], flow: null };
  const val = step.allowSkip && /^skip$/i.test(raw.trim()) ? "" : raw.trim();
  if (step.validate && !step.validate(val) && !(step.allowSkip && val === ""))
    return { messages: [...base, { role: "bot", text: step.errorPrompt || "Mind trying that again?" }], flow };
  const data = { ...flow.data, [step.key]: val };
  const ni = nextAskable(steps, flow.idx + 1, data);
  if (ni === -1) return completeFlow(flow.type, data, base);
  const nx = steps[ni];
  return { messages: [...base, { role: "bot", text: typeof nx.prompt === "function" ? nx.prompt(data) : nx.prompt, chips: nx.chips || [] }], flow: { type: flow.type, idx: ni, data } };
}

/* ================================================================== */
/*  Seed data                                                          */
/* ================================================================== */
const GREETING = {
  role: "bot",
  text: "Hey, welcome to Ryde Dental Family 😊 Ask me anything about our treatments, costs or hours — or tell me what's going on and I'll help you book in. What can I help with?",
  chips: ["Book a visit", "Meet the dentists", "I've got tooth pain", "Teeth whitening"],
};
const SEED_LEADS = [
  { id: "RDF-1042", type: "Booking", name: "Aisha Khan", phone: "0412 553 901", email: "aisha.k@email.com", service: "Invisalign / braces", preferred: "This week", patientType: "New patient", status: "New", createdAt: Date.now() - 1000 * 60 * 22,
    transcript: [{ role: "user", text: "how does invisalign work" }, { role: "bot", text: "Invisalign uses clear, removable aligners that gently nudge your teeth straight over time — nearly invisible, and you pop them out to eat and brush. Want me to book you a consult? 😊" }, { role: "user", text: "yes please this week, im new" }] },
  { id: "RDF-1041", type: "Callback", name: "Tom Reynolds", phone: "0421 778 220", email: "", service: "Broken tooth", preferred: "Callback requested", patientType: "—", status: "Contacted", createdAt: Date.now() - 1000 * 60 * 95,
    transcript: [{ role: "user", text: "broke a tooth on the weekend, really sore" }, { role: "bot", text: "Ouch — best to call us on (02) 9807 9800 and we'll fit you in today. Want me to grab your details for a callback too?" }, { role: "user", text: "yes please tom 0421 778 220" }] },
  { id: "RDF-1039", type: "Booking", name: "Priya Sharma", phone: "0438 110 540", email: "priya.s@email.com", service: "General check-up & clean", preferred: "Next week", patientType: "New patient", status: "Booked", createdAt: Date.now() - 1000 * 60 * 60 * 26,
    transcript: [{ role: "user", text: "do you do saturday or evenings" }, { role: "bot", text: "We do — Saturdays 9 to 4, plus Thursday evenings. Which suits and I'll book a check-up & clean?" }] },
];

/* ================================================================== */
/*  UI atoms                                                           */
/* ================================================================== */
function AiAvatar({ size = 36 }) {
  return (
    <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: size, height: size, background: C.white }}>
      <div className="flex items-center justify-center rounded-full" style={{ width: size - 8, height: size - 8, background: `linear-gradient(145deg, ${C.tealSoft}, ${C.tealDeep})` }}>
        <Sparkles size={size * 0.42} color="#EAFBF8" strokeWidth={2.2} />
      </div>
    </div>
  );
}
function TeamAvatar({ size = 28 }) {
  return (
    <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: size, height: size, background: `linear-gradient(145deg, ${C.coral}, ${C.coralDeep})` }}>
      <Headphones size={size * 0.5} color="#fff" strokeWidth={2.2} />
    </div>
  );
}
function Typing() {
  return (
    <div className="flex gap-1.5 items-center px-4 py-3 rounded-2xl" style={{ background: C.white, border: `1px solid ${C.line}`, width: "fit-content" }}>
      {[0, 1, 2].map((i) => <span key={i} className="rdf-dot" style={{ animationDelay: `${i * 0.15}s`, background: C.tealSoft }} />)}
    </div>
  );
}
function ConfirmCard({ b }) {
  const cb = b.type === "Callback";
  return (
    <div className="rdf-in rounded-2xl p-4 ml-9" style={{ background: C.greenSoft, border: "1px solid #BFE6D5" }}>
      <div className="flex items-center gap-2 mb-2">
        {cb ? <PhoneCall size={16} color={C.green} /> : <CheckCircle2 size={17} color={C.green} />}
        <span className="font-semibold text-[13.5px]" style={{ color: C.green, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{cb ? "Callback request sent" : "Appointment request sent"}</span>
      </div>
      <div className="space-y-1 text-[13px]" style={{ color: C.ink }}>
        <div><span style={{ color: C.muted }}>Name · </span>{b.name}</div>
        <div><span style={{ color: C.muted }}>{cb ? "About · " : "For · "}</span>{b.service}{!cb && b.preferred ? ` · ${b.preferred}` : ""}</div>
        <div className="text-[12px] pt-0.5" style={{ color: C.muted }}>The team will call {b.phone}{cb ? " shortly." : " to lock in a time."}</div>
      </div>
    </div>
  );
}
function Message({ m }) {
  if (m.role === "system")
    return <div className="rdf-in flex justify-center"><span className="text-[11.5px] px-3 py-1 rounded-full" style={{ background: "#E7EEEC", color: C.muted }}>{m.text}</span></div>;
  if (m.role === "confirm") return <ConfirmCard b={m.booking} />;
  if (m.role === "attach")
    return (
      <div className="rdf-in flex justify-end">
        <div className="rounded-2xl overflow-hidden" style={{ maxWidth: "70%", border: `1px solid ${C.line}`, background: C.white }}>
          {m.isImage && m.url
            ? <img src={m.url} alt={m.name} style={{ maxWidth: 180, display: "block" }} />
            : <div className="flex items-center gap-2 px-3 py-2.5"><FileText size={16} color={C.teal} /><span className="text-[13px] truncate" style={{ color: C.ink, maxWidth: 140 }}>{m.name}</span></div>}
        </div>
      </div>
    );
  const mine = m.role === "user";
  const team = m.role === "team";
  return (
    <div className={`rdf-in flex ${mine ? "justify-end" : "justify-start"} gap-2 items-end`}>
      {!mine && (team ? <TeamAvatar size={28} /> : <AiAvatar size={28} />)}
      <div>
        {team && <div className="text-[11px] mb-1 ml-1 font-semibold" style={{ color: C.coralDeep }}>Reception team</div>}
        {m.viaAI && <div className="flex items-center gap-1 mb-1 ml-1"><Sparkles size={10} color={C.tealSoft} /><span className="text-[10.5px] font-semibold" style={{ color: C.tealSoft }}>AI assist · Gemini</span></div>}
        <div className="px-3.5 py-2.5 text-[14.5px] leading-relaxed" style={{
          maxWidth: "100%", background: mine ? C.teal : C.white, color: mine ? "#EAFBF8" : C.ink,
          borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          border: mine ? "none" : `1px solid ${team ? "#F6D3D0" : C.line}`,
          borderTop: team ? `2px solid ${C.coral}` : undefined,
          boxShadow: mine ? "none" : "0 1px 2px rgba(15,46,46,0.04)", whiteSpace: "pre-wrap",
        }}>{m.text}</div>
      </div>
    </div>
  );
}

/* quick booking form (header calendar shortcut) */
function BookingForm({ onSubmit, onClose }) {
  const [f, setF] = useState({ name: "", phone: "", service: "", when: "", patientType: "New patient" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.name.trim() && f.phone.trim() && f.service;
  const field = "w-full px-3 py-2 text-[14px] rounded-lg outline-none";
  const fStyle = { background: C.white, border: `1px solid ${C.line}`, color: C.ink };
  return (
    <div className="rdf-in rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.line}`, background: C.mintSoft }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: C.white, borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2"><CalendarCheck size={17} color={C.coral} /><span className="font-semibold text-[14px]" style={{ color: C.ink, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Quick booking</span></div>
        <button onClick={onClose} className="opacity-50 hover:opacity-100"><X size={16} color={C.ink} /></button>
      </div>
      <div className="p-4 space-y-2.5">
        <div className="flex gap-2">
          <input className={field} style={fStyle} placeholder="Full name *" value={f.name} onChange={set("name")} />
          <input className={field} style={fStyle} placeholder="Mobile *" value={f.phone} onChange={set("phone")} />
        </div>
        <select className={field} style={{ ...fStyle, color: f.service ? C.ink : C.muted }} value={f.service} onChange={set("service")}>
          <option value="">What do you need? *</option>{["General check-up & clean", "Emergency / tooth pain", "Teeth whitening", "Invisalign / braces", "Dental implants", "Veneers / smile makeover", "Root canal", "Children's dentist", "Something else"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex gap-2">
          <select className={field} style={{ ...fStyle, color: f.when ? C.ink : C.muted }} value={f.when} onChange={set("when")}>
            <option value="">When?</option>{WHEN_CHIPS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={field} style={fStyle} value={f.patientType} onChange={set("patientType")}>
            {["New patient", "Existing patient"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button disabled={!ok} onClick={() => onSubmit(f)} className="w-full py-2.5 rounded-lg font-semibold text-[14px] flex items-center justify-center gap-2"
          style={{ background: ok ? C.coral : "#E7D6D4", color: C.white, cursor: ok ? "pointer" : "not-allowed", boxShadow: ok ? "0 6px 16px rgba(242,97,90,0.32)" : "none", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          Send request <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Patient chat                                                       */
/* ================================================================== */
function ChatView({ messages, setMessages, mode, leads, setLeads }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [listening, setListening] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const recogRef = useRef(null);
  const lastTopic = useRef(null);
  const last = messages[messages.length - 1];
  const chips = last && last.role === "bot" ? last.chips || [] : [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, showForm]);
  useEffect(() => { if (mode === "human") setFlow(null); }, [mode]);

  const dupe = (p) => leads.some((l) => l.phone.replace(/\s/g, "") === String(p).replace(/\s/g, ""));

  // LLM-first: every info answer is composed fresh by the model (no canned repeats).
  // (Booking/callback capture stays deterministic below, keeping patient data out of the LLM.)
  async function answerInfo(text, base) {
    try {
      const ai = await callAI(base);
      return { messages: [...base, { role: "bot", text: ai, chips: ["Book a visit", "Request a callback"] }] };
    } catch {
      return { messages: [...base, { role: "bot", text: "I'm having a little trouble there — but our team can help. Want me to grab your number for a quick callback, or book you a visit?", chips: ["Request a callback", "Book a visit"] }] };
    }
  }

  async function send(text) {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput("");
    const next = [...messages, { role: "user", text: t }];
    setMessages(next);
    if (mode === "human") return; // AI stays quiet while team handles it
    setBusy(true);
    try {
      if (flow) {
        if (isQuestion(t)) {
          // user went off-script mid-booking → answer the side question, then re-ask the current step
          const ans = await answerInfo(t, next);
          const step = FLOWS[flow.type].steps[flow.idx];
          const reprompt = typeof step.prompt === "function" ? step.prompt(flow.data) : step.prompt;
          setMessages([...ans.messages, { role: "bot", text: reprompt, chips: step.chips || [] }]);
        } else {
          const out = advanceFlow(flow, t, next);
          setMessages(out.messages); setFlow(out.flow);
          if (out.lead) setLeads((l) => [out.lead, ...l]);
        }
      } else {
        const intent = matchIntent(t);
        if (intent && (intent.action === "book" || intent.action === "callback")) {
          const svc = bestTopic(t) || lastTopic.current || "";
          const out = startFlow(intent.action === "callback" ? "callback" : "booking", next, svc ? { service: svc } : {});
          setMessages(out.messages); setFlow(out.flow);
        } else {
          const ans = await answerInfo(t, next);
          setMessages(ans.messages);
        }
      }
    } finally { setBusy(false); }
  }

  function submitForm(f) {
    if (dupe(f.phone)) { setShowForm(false); return; }
    const lead = makeLead(f, messages, "Booking");
    setLeads((l) => [lead, ...l]); setShowForm(false);
    setMessages((m) => [...m, { role: "bot", text: `Beautiful, thanks ${firstName(f.name)}! 🎉 I've sent your request through — the team will call you on ${f.phone} to lock in a time. Anything else while you're here?`, chips: ["Opening hours", "Where are you?", "Payment plans"] }, { role: "confirm", booking: lead }]);
  }

  function onFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const isImage = file.type.startsWith("image/");
    const url = isImage ? URL.createObjectURL(file) : null;
    setMessages((m) => [...m, { role: "attach", name: file.name, url, isImage }]);
    e.target.value = "";
    if (mode === "human") return;
    setBusy(true);
    setTimeout(() => {
      setMessages((m) => [...m, { role: "bot", text: "Thanks for sending that through 📎 — I've added it to your enquiry so the dentist can take a look. Shall I grab your name and number so we can follow up?", chips: ["Request a callback", "Book a visit"] }]);
      setBusy(false);
    }, 380);
  }

  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMessages((m) => [...m, { role: "system", text: "Voice input needs Chrome or Edge — type away instead 🙂" }]); return; }
    if (listening) { recogRef.current?.stop(); return; }
    const r = new SR(); recogRef.current = r; r.lang = "en-AU"; r.interimResults = true; r.continuous = false;
    r.onresult = (e) => { let s = ""; for (const res of e.results) s += res[0].transcript; setInput(s); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    try { r.start(); setListening(true); } catch { setListening(false); }
  }

  const human = mode === "human";
  return (
    <div className="flex flex-col rounded-3xl overflow-hidden mx-auto" style={{ width: "100%", maxWidth: 420, height: 660, background: C.mintSoft, border: `1px solid ${C.line}`, boxShadow: "0 24px 60px rgba(10,63,61,0.18)" }}>
      <div className="px-4 py-3.5 flex items-center gap-3" style={{ background: human ? `linear-gradient(135deg, ${C.coralDeep}, #B83F3A)` : `linear-gradient(135deg, ${C.teal}, ${C.tealDeep})` }}>
        {human ? <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 42, height: 42, background: "rgba(255,255,255,0.16)" }}><Headphones size={20} color="#fff" /></div> : <AiAvatar size={42} />}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15.5px] text-white leading-tight" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Ryde Dental Family</div>
          <div className="flex items-center gap-1.5">
            <span className="rdf-pulse" style={{ width: 7, height: 7, borderRadius: 99, background: human ? "#FFD7A8" : "#5FE3B0" }} />
            <span className="text-[12px]" style={{ color: human ? "#FFE3D8" : "#BFE6E2" }}>{human ? "Reception team · online" : "Smily · instant replies"}</span>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} title="Quick booking" className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: "rgba(255,255,255,0.14)" }}><CalendarCheck size={15} color="#fff" /></button>
        <a href="tel:0298079800" className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: "rgba(255,255,255,0.14)" }}><Phone size={15} color="#fff" /></a>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3" style={{ background: C.bg }}>
        {messages.map((m, i) => <Message key={i} m={m} />)}
        {busy && <div className="flex gap-2 items-end"><AiAvatar size={28} /><Typing /></div>}
        {showForm && <BookingForm onSubmit={submitForm} onClose={() => setShowForm(false)} />}
        <div ref={endRef} />
      </div>

      {!showForm && chips.length > 0 && !busy && (
        <div className="px-3.5 pt-2.5 flex flex-wrap gap-2" style={{ background: C.bg }}>
          {chips.map((c, i) => <button key={i} onClick={() => send(c)} className="px-3 py-1.5 text-[13px] rounded-full font-medium rdf-chip" style={{ background: C.white, color: C.teal, border: `1px solid ${C.line}` }}>{c}</button>)}
        </div>
      )}

      <div className="p-3 flex items-center gap-2" style={{ background: C.bg, borderTop: `1px solid ${C.line}` }}>
        <div className="flex-1 flex items-center gap-1 rounded-full pl-4 pr-2" style={{ background: C.white, border: `1px solid ${C.line}` }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={listening ? "Listening…" : "Type a message"} className="flex-1 py-2.5 text-[14px] bg-transparent outline-none" style={{ color: C.ink }} />
          <button onClick={toggleMic} title="Voice input" className="flex items-center justify-center rounded-full transition-colors" style={{ width: 30, height: 30, background: listening ? C.coralSoft : "transparent" }}>
            <Mic size={17} color={listening ? C.coralDeep : C.muted} className={listening ? "rdf-mic" : ""} />
          </button>
          <button onClick={() => fileRef.current?.click()} title="Attach a file" className="flex items-center justify-center rounded-full" style={{ width: 30, height: 30 }}>
            <Paperclip size={17} color={C.muted} />
          </button>
        </div>
        <button onClick={() => send()} disabled={!input.trim()} className="flex items-center justify-center rounded-full transition-transform active:scale-95" style={{ width: 42, height: 42, background: C.teal, opacity: input.trim() ? 1 : 0.5 }}>
          <Send size={17} color="#EAFBF8" />
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={onFile} accept="image/*,.pdf,.doc,.docx" />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Staff backend                                                      */
/* ================================================================== */
const STATUS = { New: { bg: C.coralSoft, fg: C.coralDeep }, Contacted: { bg: C.amberSoft, fg: C.amber }, Booked: { bg: C.greenSoft, fg: C.green } };
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

function LiveChat({ messages, mode, remaining, onSend, onHandBack }) {
  const [reply, setReply] = useState("");
  const boxRef = useRef(null);
  useEffect(() => { boxRef.current?.scrollTo(0, boxRef.current.scrollHeight); }, [messages]);
  const human = mode === "human";
  const view = messages.filter((m) => ["user", "bot", "team", "attach"].includes(m.role));
  function go() { const t = reply.trim(); if (!t) return; onSend(t); setReply(""); }
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: C.white, border: `1px solid ${C.line}` }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: C.ink }}><MessageCircle size={15} color={C.teal} /> Live chat · 1 active</div>
        {human
          ? <span className="text-[11px] px-2 py-1 rounded-full font-semibold flex items-center gap-1.5" style={{ background: C.amberSoft, color: C.amber }}><span className="rdf-pulse" style={{ width: 6, height: 6, borderRadius: 99, background: C.amber }} /> You're handling · AI back in {mmss(remaining)}</span>
          : <span className="text-[11px] px-2 py-1 rounded-full font-semibold flex items-center gap-1.5" style={{ background: C.greenSoft, color: C.green }}><span className="rdf-pulse" style={{ width: 6, height: 6, borderRadius: 99, background: C.green }} /> AI handling</span>}
      </div>
      <div ref={boxRef} className="px-3 py-3 space-y-2 overflow-y-auto" style={{ maxHeight: 220, background: C.bg }}>
        {view.map((m, i) => {
          if (m.role === "attach") return <div key={i} className="flex justify-end"><span className="text-[12px] px-2.5 py-1.5 rounded-lg flex items-center gap-1.5" style={{ background: C.white, border: `1px solid ${C.line}`, color: C.ink }}><Paperclip size={12} /> {m.name}</span></div>;
          const left = m.role !== "user";
          const team = m.role === "team";
          return (
            <div key={i} className={`flex ${left ? "justify-start" : "justify-end"}`}>
              <div className="px-3 py-2 text-[12.5px]" style={{ maxWidth: "82%", background: m.role === "user" ? C.teal : team ? C.coralSoft : C.white, color: m.role === "user" ? "#EAFBF8" : C.ink, border: left ? `1px solid ${team ? "#F6D3D0" : C.line}` : "none", borderRadius: 12 }}>
                {team && <span className="block text-[10px] font-bold mb-0.5" style={{ color: C.coralDeep }}>You</span>}{m.text}
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-3 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
        {human && <button onClick={onHandBack} title="Hand back to AI now" className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 36, height: 36, background: C.mint }}><RotateCcw size={15} color={C.teal} /></button>}
        <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Reply as reception (this pauses the AI)…" className="flex-1 px-3 py-2 text-[13.5px] rounded-lg outline-none" style={{ background: C.white, border: `1px solid ${C.line}`, color: C.ink }} />
        <button onClick={go} disabled={!reply.trim()} className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: C.coral, opacity: reply.trim() ? 1 : 0.5 }}><Send size={15} color="#fff" /></button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div className="flex-1 rounded-2xl p-4" style={{ background: C.white, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-center rounded-xl mb-3" style={{ width: 36, height: 36, background: accent + "1A" }}>{icon}</div>
      <div className="text-[26px] font-bold leading-none" style={{ color: C.ink, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{value}</div>
      <div className="text-[12.5px] mt-1" style={{ color: C.muted }}>{label}</div>
    </div>
  );
}

function AdminView({ messages, mode, humanUntil, now, leads, setLeads, onStaffReply, onHandBack }) {
  const [sel, setSel] = useState(null);
  const lead = leads.find((l) => l.id === sel);
  const counts = { total: leads.length, nw: leads.filter((l) => l.status === "New").length, cb: leads.filter((l) => l.type === "Callback").length };
  const setStatus = (id, status) => setLeads(leads.map((l) => (l.id === id ? { ...l, status } : l)));
  const remaining = humanUntil ? humanUntil - now : 0;
  return (
    <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
      <div className="rounded-3xl overflow-hidden" style={{ background: C.white, border: `1px solid ${C.line}`, boxShadow: "0 24px 60px rgba(10,63,61,0.12)" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${C.tealDeep}, ${C.teal})` }}>
          <div className="flex items-center gap-2.5"><LayoutDashboard size={19} color="#EAFBF8" /><span className="font-bold text-white text-[15.5px]" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Staff Inbox · Ryde Dental Family</span></div>
          <span className="text-[11px] px-2 py-1 rounded-full font-semibold" style={{ background: "rgba(255,255,255,0.16)", color: "#EAFBF8" }}>DEMO DATA</span>
        </div>
        <div className="p-5 space-y-5" style={{ background: C.mintSoft }}>
          <LiveChat messages={messages} mode={mode} remaining={remaining} onSend={onStaffReply} onHandBack={onHandBack} />
          <div className="flex gap-3">
            <StatCard icon={<Inbox size={18} color={C.teal} />} label="Total enquiries" value={counts.total} accent={C.teal} />
            <StatCard icon={<AlertCircle size={18} color={C.coral} />} label="New · need a call" value={counts.nw} accent={C.coral} />
            <StatCard icon={<PhoneCall size={18} color={C.tealSoft} />} label="Callback requests" value={counts.cb} accent={C.tealSoft} />
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: C.white, border: `1px solid ${C.line}` }}>
            <div className="px-4 py-3 text-[13px] font-semibold flex items-center gap-2" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}><Users size={15} color={C.teal} /> Patient enquiries</div>
            <div className="divide-y" style={{ borderColor: C.line }}>
              {leads.map((l) => (
                <button key={l.id} onClick={() => setSel(l.id)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#F4FAF8] transition-colors">
                  <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 38, height: 38, background: C.mint, color: C.teal, fontWeight: 700 }}>{l.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[14px] truncate" style={{ color: C.ink }}>{l.name}</span>
                      {l.type === "Callback" ? <span className="text-[10.5px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1" style={{ background: "#E3F0EF", color: C.teal }}><PhoneCall size={9} /> Callback</span> : <span className="text-[11px]" style={{ color: C.muted }}>{l.patientType}</span>}
                    </div>
                    <div className="text-[12.5px] truncate" style={{ color: C.muted }}>{l.service} · {l.preferred}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[11px] px-2 py-1 rounded-full font-semibold" style={{ background: STATUS[l.status].bg, color: STATUS[l.status].fg }}>{l.status}</span>
                    <div className="text-[11px] mt-1" style={{ color: C.muted }}>{timeAgo(l.createdAt)}</div>
                  </div>
                  <ChevronRight size={16} color={C.muted} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {lead && (
        <div className="fixed inset-0 z-50 flex justify-end rdf-fade" style={{ background: "rgba(10,46,46,0.4)" }} onClick={() => setSel(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto rdf-slide" style={{ background: C.mintSoft }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center gap-3 sticky top-0" style={{ background: `linear-gradient(135deg,${C.teal},${C.tealDeep})` }}>
              <button onClick={() => setSel(null)}><ArrowLeft size={18} color="#EAFBF8" /></button>
              <span className="font-bold text-white text-[15px]" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{lead.name}</span>
              <span className="ml-auto text-[11px]" style={{ color: "#BFE6E2" }}>{lead.type} · #{lead.id}</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-2xl p-4 space-y-2.5" style={{ background: C.white, border: `1px solid ${C.line}` }}>
                {[[<Phone size={14} color={C.teal} />, "Mobile", lead.phone], [<Sparkles size={14} color={C.teal} />, lead.type === "Callback" ? "About" : "Service", lead.service], [<Clock size={14} color={C.teal} />, "Preferred", lead.preferred], [<User size={14} color={C.teal} />, "Patient", lead.patientType]].map(([ic, k, v], i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center rounded-lg" style={{ width: 26, height: 26, background: C.mint }}>{ic}</div>
                    <span className="text-[12px] w-16" style={{ color: C.muted }}>{k}</span>
                    <span className="text-[13.5px] font-medium" style={{ color: C.ink }}>{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[12px] font-semibold mb-2" style={{ color: C.muted }}>UPDATE STATUS</div>
                <div className="flex gap-2">
                  {Object.keys(STATUS).map((s) => <button key={s} onClick={() => setStatus(lead.id, s)} className="flex-1 py-2 text-[12.5px] rounded-lg font-semibold" style={{ background: lead.status === s ? STATUS[s].fg : C.white, color: lead.status === s ? C.white : C.muted, border: `1px solid ${lead.status === s ? STATUS[s].fg : C.line}` }}>{s}</button>)}
                </div>
              </div>
              <div>
                <div className="text-[12px] font-semibold mb-2" style={{ color: C.muted }}>CHAT TRANSCRIPT</div>
                <div className="rounded-2xl p-3 space-y-2" style={{ background: C.white, border: `1px solid ${C.line}` }}>
                  {lead.transcript.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className="px-3 py-2 text-[12.5px]" style={{ maxWidth: "82%", background: m.role === "user" ? C.teal : C.mint, color: m.role === "user" ? "#EAFBF8" : C.ink, borderRadius: 12 }}>{m.text}</div>
                    </div>
                  ))}
                </div>
              </div>
              <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="w-full py-3 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2" style={{ background: C.coral, color: C.white, boxShadow: "0 6px 16px rgba(242,97,90,0.3)", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                <Phone size={16} /> Call {lead.name.split(" ")[0]}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Root                                                               */
/* ================================================================== */
export default function App() {
  const [view, setView] = useState("chat");
  const [messages, setMessages] = useState([GREETING]);
  const [mode, setMode] = useState("ai");
  const [humanUntil, setHumanUntil] = useState(null);
  const [leads, setLeads] = useState(SEED_LEADS);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (mode === "human" && humanUntil && now >= humanUntil) {
      setMode("ai"); setHumanUntil(null);
      setMessages((m) => [...m, { role: "system", text: "Smily's back online and happy to help 😊" }]);
    }
  }, [now, mode, humanUntil]);

  function onStaffReply(text) {
    setMessages((m) => {
      const add = [];
      if (mode !== "human") add.push({ role: "system", text: "You're now chatting with our reception team 👋" });
      add.push({ role: "team", text });
      return [...m, ...add];
    });
    setMode("human"); setHumanUntil(Date.now() + RESUME_MS);
  }
  function onHandBack() { setMode("ai"); setHumanUntil(null); setMessages((m) => [...m, { role: "system", text: "Smily's back online and happy to help 😊" }]); }

  return (
    <div className="min-h-screen w-full py-8 px-4" style={{ background: `radial-gradient(1200px 600px at 50% -10%, ${C.mint}, ${C.bg})`, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');
        .rdf-dot{width:7px;height:7px;border-radius:99px;display:inline-block;animation:rdfb 1s infinite ease-in-out}
        @keyframes rdfb{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}
        .rdf-in{animation:rdfIn .3s cubic-bezier(.2,.8,.2,1) both}
        @keyframes rdfIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .rdf-chip:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(10,63,61,.1)}
        .rdf-pulse{animation:rdfP 1.8s infinite}
        @keyframes rdfP{0%{box-shadow:0 0 0 0 rgba(95,227,176,.5)}70%{box-shadow:0 0 0 5px rgba(95,227,176,0)}100%{box-shadow:0 0 0 0 rgba(95,227,176,0)}}
        .rdf-mic{animation:rdfM 1s infinite}@keyframes rdfM{0%,100%{opacity:1}50%{opacity:.4}}
        .rdf-fade{animation:rdfF .2s ease both}@keyframes rdfF{from{opacity:0}to{opacity:1}}
        .rdf-slide{animation:rdfS .3s cubic-bezier(.2,.8,.2,1) both}@keyframes rdfS{from{transform:translateX(30px);opacity:0}to{transform:translateX(0);opacity:1}}
        @media (prefers-reduced-motion:reduce){.rdf-in,.rdf-slide,.rdf-fade,.rdf-dot,.rdf-pulse,.rdf-mic{animation:none!important}}
        select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235B7472' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:30px}
      `}</style>
      <div className="mx-auto mb-6 flex items-center gap-1 p-1 rounded-full" style={{ width: "fit-content", background: C.white, border: `1px solid ${C.line}` }}>
        {[["chat", "Patient chat", <MessageCircle size={15} />], ["admin", "Staff backend", <LayoutDashboard size={15} />]].map(([id, label, ic]) => (
          <button key={id} onClick={() => setView(id)} className="px-4 py-2 rounded-full text-[13.5px] font-semibold flex items-center gap-2 transition-all" style={{ background: view === id ? C.teal : "transparent", color: view === id ? "#EAFBF8" : C.muted, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{ic} {label}</button>
        ))}
      </div>
      {view === "chat"
        ? <ChatView messages={messages} setMessages={setMessages} mode={mode} leads={leads} setLeads={setLeads} />
        : <AdminView messages={messages} mode={mode} humanUntil={humanUntil} now={now} leads={leads} setLeads={setLeads} onStaffReply={onStaffReply} onHandBack={onHandBack} />}
      <p className="text-center text-[12px] mt-6 mx-auto max-w-md" style={{ color: C.muted }}>
        Hybrid engine: instant built-in answers for common questions (free), with a smart AI fallback for anything unusual (shown as ✨ AI assist). In this demo the fallback runs on Claude; in production it’s Google Gemini’s free tier. Reply from the Staff backend to take over — Smily resumes after ~1 hour (45s here). Voice &amp; file upload live in the input bar.
      </p>
    </div>
  );
}
