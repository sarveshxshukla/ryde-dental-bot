/* Ryde Dental Family chat widget — paste ONE script tag on the site:
   <script src="https://YOUR-APP-URL/widget.js" defer></script>
   Incremental rendering: messages are appended, never re-drawn, so typing is never interrupted. */
(function () {
  var API = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return ""; } })();
  var SID = localStorage.getItem("rdf_sid");
  if (!SID) { SID = "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem("rdf_sid", SID); }
  var LOGKEY = "rdf_log_" + SID;
  var msgs = []; try { msgs = JSON.parse(localStorage.getItem(LOGKEY) || "[]"); } catch (e) {}
  var savedContact = null; try { savedContact = JSON.parse(localStorage.getItem("rdf_contact") || "null"); } catch (e) {}
  var savedName = (savedContact && savedContact.name) || "";
  var intakeDone = !!savedContact;
  var rendered = {};   // ts -> already in the DOM
  var seen = {};       // ts -> already known (event de-dupe)
  msgs.forEach(function (m) { if (m.ts) seen[m.ts] = 1; });
  var mode = "ai", open = false, started = false, listening = false, recog = null, pollTimer = null;

  // editable greeting (set in the staff panel -> Settings). Falls back to the default if unset.
  var CFG_GREETING = "";
  try { fetch(API + "/api/config").then(function (r) { return r.json(); }).then(function (c) { if (c && c.greeting) CFG_GREETING = c.greeting; }).catch(function () {}); } catch (e) {}
  // --- Australian mobile validation -------------------------------------------------
  // Accepts: 04xx xxx xxx | 04xxxxxxxx | +614xxxxxxxx | 614xxxxxxxx | 4xxxxxxxx
  // Ignores spaces, dashes, brackets and dots. Rejects landlines and junk.
  function auMobile(raw) {
    var d = String(raw || "").replace(/[\s\-().]/g, "");
    if (d.indexOf("+61") === 0) d = "0" + d.slice(3);
    else if (d.indexOf("0061") === 0) d = "0" + d.slice(4);
    else if (d.indexOf("61") === 0 && d.length === 11) d = "0" + d.slice(2);
    else if (d.length === 9 && d.charAt(0) === "4") d = "0" + d;
    return /^04\d{8}$/.test(d) ? d : null;   // returns the tidy 04xxxxxxxx form, or null
  }

  function greet(fn) {
    if (CFG_GREETING) return CFG_GREETING.replace(/\{\s*name\s*\}/gi, fn || "").replace(/\s+/g, " ").trim();
    return "Hi " + fn + "! \uD83D\uDC4B How can I help you today?";
  }

  var C = { teal: "#F17A31", tealDeep: "#C56428", coral: "#F17A31", coralDeep: "#C56428",
    launch: "#0F766E", launchDeep: "#115E59",   // launcher bubble — deliberately NOT the site orange, so it stands out
    ink: "#38291B", mint: "#FAEFE1", line: "#ECE2D4", muted: "#8A7A68", bg: "#FBF6EF" };

  var css = "" +
    "#rdfw,#rdfw *{box-sizing:border-box;font-family:'Inter',-apple-system,Segoe UI,Roboto,sans-serif}" +
    "#rdf-btn.hidden{opacity:0;visibility:hidden;pointer-events:none}" +
    "#rdf-btn{position:fixed;right:18px;bottom:96px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;z-index:2147483000;box-shadow:0 10px 26px rgba(15,118,110,.45);background:linear-gradient(135deg," + C.launch + "," + C.launchDeep + ");animation:rdfnudge 6s ease-in-out infinite;display:flex;align-items:center;justify-content:center;transition:transform .2s}" +
    "#rdf-btn:hover{filter:brightness(1.14)}" +
    "#rdf-btn::after{content:'';position:absolute;inset:0;border-radius:50%;pointer-events:none;animation:rdfring 2.6s cubic-bezier(.25,.6,.35,1) infinite}" +
    "@keyframes rdfring{0%{box-shadow:0 0 0 0 rgba(15,118,110,.55)}70%{box-shadow:0 0 0 18px rgba(15,118,110,0)}100%{box-shadow:0 0 0 0 rgba(15,118,110,0)}}" +
    "@keyframes rdfnudge{0%,86%,100%{transform:translateY(0)}90%{transform:translateY(-8px)}94%{transform:translateY(-3px)}}" +
    "@media(prefers-reduced-motion:reduce){#rdf-btn,#rdf-btn::after{animation:none}}" +
    "#rdf-pop{position:fixed;right:18px;bottom:164px;max-width:235px;background:#fff;color:" + C.ink + ";border:1px solid " + C.line + ";padding:12px 30px 12px 14px;border-radius:16px 16px 4px 16px;box-shadow:0 12px 34px rgba(10,63,61,.22);z-index:2147482999;cursor:pointer;font-size:14px;line-height:1.45;display:none}" +
    "#rdf-pop.on{display:block;animation:rdfup .3s ease}" +
    "#rdf-pop::after{content:'';position:absolute;right:41px;bottom:-7px;width:13px;height:13px;background:#fff;border-right:1px solid " + C.line + ";border-bottom:1px solid " + C.line + ";border-radius:0 0 3px 0;transform:rotate(45deg)}" +
    "#rdf-pop b{color:" + C.launch + ";font-size:12.5px;display:block;margin-bottom:2px}" +
    "#rdf-pop .x{position:absolute;top:5px;right:9px;font-size:17px;color:" + C.muted + ";line-height:1}" +
    "#rdf-panel{position:fixed;right:18px;bottom:86px;width:380px;max-width:calc(100vw - 28px);height:620px;max-height:calc(100vh - 106px);background:" + C.bg + ";border:1px solid " + C.line + ";border-radius:22px;overflow:hidden;display:none;flex-direction:column;z-index:2147483000;box-shadow:0 24px 60px rgba(10,63,61,.25)}" +
    "#rdf-panel.on{display:flex;animation:rdfup .25s ease}" +
    "@keyframes rdfup{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}" +
    "#rdf-head{padding:14px 15px 14px 16px;display:flex;align-items:center;gap:10px;background:linear-gradient(135deg," + C.teal + "," + C.tealDeep + ")}" +
    "#rdf-head .av{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;flex-shrink:0}" +
    "#rdf-head .nm{color:#fff;font-weight:700;font-size:15px;line-height:1.1}" +
    "#rdf-head .st{color:#FCE3CF;font-size:12px;display:flex;align-items:center;gap:6px}" +
    "#rdf-head.human{background:linear-gradient(135deg," + C.coralDeep + ",#954B1E)}#rdf-head.human .st{color:#FFE0C8}" +
    "#rdf-book{background:rgba(255,255,255,.16);border:none;color:#fff;cursor:pointer;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-left:auto;flex-shrink:0}" +
    "#rdf-x{margin-left:9px;background:rgba(255,255,255,.16);border:none;color:#fff;cursor:pointer;font-size:24px;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}" +
    "#rdf-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}" +
    ".rdf-row{display:flex;gap:8px;align-items:flex-end;animation:rdfin .25s ease}" +
    "@keyframes rdfin{from{opacity:0;transform:translateY(6px)}to{opacity:1}}" +
    ".rdf-row.me{justify-content:flex-end}" +
    ".rdf-b{max-width:80%;width:fit-content;padding:10px 13px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:keep-all !important;overflow-wrap:break-word !important;hyphens:none !important}" +
    ".rdf-b.bot{background:#fff;color:" + C.ink + ";border:1px solid " + C.line + ";border-radius:16px 16px 16px 4px}" +
    ".rdf-b.me{background:" + C.teal + ";color:#EAFBF8;border-radius:16px 16px 4px 16px}" +
    ".rdf-b.team{background:#FBE1D1;color:" + C.ink + ";border:1px solid #F3D2BC;border-top:2px solid " + C.coral + ";border-radius:16px 16px 16px 4px}" +
    ".rdf-team-l{font-size:11px;font-weight:700;color:" + C.coralDeep + ";margin:0 0 3px 2px}" +
    ".rdf-sys{align-self:center;font-size:11.5px;color:" + C.muted + ";background:#F0EADE;padding:4px 11px;border-radius:20px}" +
    ".rdf-av{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#F39A5E," + C.tealDeep + ")}" +
    "#rdf-chips{padding:10px 14px 12px;display:flex;flex-wrap:wrap;gap:7px}#rdf-chips:empty{padding:0}" +
    ".rdf-chip{padding:6px 12px;font-size:13px;font-weight:500;border-radius:20px;background:#fff;color:" + C.teal + ";border:1px solid " + C.line + ";cursor:pointer}" +
    ".rdf-chip:hover{transform:translateY(-1px)}" +
    ".rdf-cta{display:inline-flex;align-items:center;gap:6px;padding:11px 16px;font-size:13px;font-weight:700;border-radius:12px;background:#1FA463;color:#fff !important;border:none;text-decoration:none;cursor:pointer;box-shadow:0 3px 12px rgba(31,164,99,.32);transition:transform .12s,background .12s}" +
    ".rdf-cta:hover{transform:translateY(-1px);background:#178a52}" +
    "#rdf-foot{padding:12px;display:flex;align-items:center;gap:8px;border-top:1px solid " + C.line + "}" +
    "#rdf-inwrap{flex:1;display:flex;align-items:center;gap:4px;background:#fff;border:1px solid " + C.line + ";border-radius:24px;padding:0 6px 0 14px}" +
    "#rdf-in{flex:1;border:none;outline:none;padding:11px 0;font-size:16px;background:transparent;color:" + C.ink + "}" +
    ".rdf-ic{width:30px;height:30px;border:none;background:none;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center}" +
    ".rdf-ic.on{background:#FBE1D1}" +
    "#rdf-send{width:42px;height:42px;border:none;border-radius:50%;cursor:pointer;background:" + C.teal + ";display:flex;align-items:center;justify-content:center;flex-shrink:0}" +
    ".rdf-dot{width:6px;height:6px;border-radius:50%;background:#F39A5E;display:inline-block;animation:rdfd 1s infinite}" +
    "@keyframes rdfd{0%,60%,100%{opacity:.4;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}" +
    "#rdf-form{position:absolute;left:0;right:0;top:68px;bottom:0;background:#FBF3EA;z-index:5;display:flex;flex-direction:column;animation:rdfin .2s ease}" +
    ".rdf-fh{padding:13px 16px;font-weight:700;font-size:14px;background:#fff;border-bottom:1px solid " + C.line + ";display:flex;align-items:center;color:" + C.ink + "}" +
    ".rdf-fh button{margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:" + C.ink + ";opacity:.6}" +
    ".rdf-fb{padding:16px;display:flex;flex-direction:column;gap:10px;overflow-y:auto}" +
    ".rdf-fi{padding:11px 12px;border:1px solid " + C.line + ";border-radius:10px;outline:none;font-size:16px;background:#fff;color:" + C.ink + "}" +
    ".rdf-seg{display:flex;gap:8px}.rdf-seg button{flex:1;padding:10px;border:1px solid " + C.line + ";background:#fff;border-radius:10px;cursor:pointer;font-size:13px;color:" + C.muted + "}.rdf-seg button.on{background:" + C.teal + ";color:#EAFBF8;border-color:" + C.teal + "}" +
    ".rdf-fbtn{padding:12px;border:none;border-radius:10px;background:" + C.coral + ";color:#fff;font-weight:700;cursor:pointer;font-size:14px}" +
    ".rdf-fn{font-size:11px;color:" + C.muted + ";text-align:center}" +
    "#rdf-intake{padding:18px 16px;overflow-y:auto;animation:rdfin .2s ease;margin:auto 0;width:100%}" +
    "#rdf-body.intake{padding:0;justify-content:center}" +
    ".rdf-iw{display:flex;flex-direction:column;gap:11px}" +
    ".rdf-it{font-weight:700;font-size:15.5px;color:" + C.ink + ";line-height:1.4}" +
    ".rdf-isub{font-size:12px;color:" + C.muted + ";margin:-4px 0 4px;line-height:1.45}" +
    ".rdf-ita{min-height:62px;resize:vertical;font-family:inherit}" +
    ".rdf-consent{display:flex;gap:8px;align-items:flex-start;font-size:11.5px;color:" + C.muted + ";line-height:1.35;cursor:pointer}" +
    ".rdf-consent input{margin-top:1px;width:16px;height:16px;flex-shrink:0;accent-color:" + C.teal + "}" +
    ".rdf-ierr{font-size:12px;color:#C0392B}.rdf-ierr:empty{display:none}" +
    "@keyframes rdfspin{to{transform:rotate(360deg)}}" +
    /* ---- armor: stop the host theme's button/link CSS bleeding into the widget ---- */
    "#rdfw button,#rdfw a,#rdfw input,#rdfw textarea{font-family:inherit!important;text-transform:none!important;letter-spacing:normal!important;text-shadow:none!important;margin:0!important;min-width:0!important;min-height:0!important;line-height:normal!important}" +
    "#rdfw #rdf-btn{width:60px!important;height:60px!important;padding:0!important;border:none!important;border-radius:50%!important;background:linear-gradient(135deg," + C.launch + "," + C.launchDeep + ")!important;box-shadow:0 10px 26px rgba(15,118,110,.45)!important}" +
    "#rdfw #rdf-btn svg,#rdfw #rdf-head .av svg{display:block!important;width:20px!important;height:20px!important;opacity:1!important;visibility:visible!important}" +
    "#rdfw svg{vertical-align:middle;max-width:none!important}" +
    "#rdfw .rdf-chip{background:#fff!important;color:" + C.teal + "!important;padding:6px 12px!important;font-size:13px!important;font-weight:500!important;border:1px solid " + C.line + "!important;border-radius:20px!important;width:auto!important;height:auto!important;box-shadow:none!important;text-align:center}" +
    "#rdfw .rdf-cta{background:#1FA463!important;color:#fff!important;padding:11px 16px!important;font-size:13px!important;border:none!important;border-radius:12px!important;width:auto!important;height:auto!important}" +
    "#rdfw #rdf-send{width:42px!important;height:42px!important;padding:0!important;border:none!important;border-radius:50%!important;background:" + C.teal + "!important;box-shadow:none!important}" +
    "#rdfw .rdf-ic{width:30px!important;height:30px!important;padding:0!important;border:none!important;border-radius:50%!important;background:none!important;box-shadow:none!important}" +
    "#rdfw .rdf-ic.on{background:#FBE1D1!important}" +
    "#rdfw #rdf-book,#rdfw #rdf-x{width:40px!important;height:40px!important;padding:0!important;border-radius:50%!important;background:rgba(255,255,255,.16)!important;border:none!important;color:#fff!important;box-shadow:none!important;display:flex!important;align-items:center;justify-content:center;flex-shrink:0}" +
    "#rdfw #rdf-x{font-size:24px!important;margin-left:9px!important}" +
    "#rdfw #rdf-book svg{width:21px!important;height:21px!important}" +
    "#rdfw .rdf-fbtn{background:" + C.coral + "!important;color:#fff!important;padding:12px!important;border:none!important;border-radius:10px!important;width:100%!important;box-shadow:none!important}" +
    "#rdfw .rdf-seg button{background:#fff!important;color:" + C.muted + "!important;padding:10px!important;border:1px solid " + C.line + "!important;border-radius:10px!important;width:auto!important;box-shadow:none!important}" +
    "#rdfw .rdf-seg button.on{background:" + C.teal + "!important;color:#EAFBF8!important;border-color:" + C.teal + "!important}";

  var spark = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EAFBF8" stroke-width="2.2"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z"/></svg>';
  // Ryde Dental Family tooth-and-stars mark, bundled as a data URI (no external load)
  var toothLogo = '<img src="data:image/png;base64,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" alt="Smily" style="width:34px;height:34px;display:block;object-fit:contain;-webkit-user-drag:none;user-select:none;pointer-events:none">';
  var sparkSm = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EAFBF8" stroke-width="2.2"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z"/></svg>';
  var head = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 14v-2a9 9 0 0118 0v2"/><path d="M21 16a2 2 0 01-2 2h-1v-5h1a2 2 0 012 2zM3 16a2 2 0 002 2h1v-5H5a2 2 0 00-2 2z"/></svg>';
  var calI = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  var micI = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A7A68" stroke-width="2"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 17v4"/></svg>';
  var clipI = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A7A68" stroke-width="2"><path d="M21 12.5l-8.5 8.5a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8.5-8.5"/></svg>';
  var sendI = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#EAFBF8" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';

  var root = document.createElement("div"); root.id = "rdfw";
  root.innerHTML =
    '<style>' + css + '</style>' +
    '<button id="rdf-btn" aria-label="Chat with us">' + toothLogo + '</button>' +
    '<div id="rdf-panel">' +
      '<div id="rdf-head"><div class="av">' + spark + '</div><div><div class="nm">Ryde Dental Family</div>' +
        '<div class="st"><span id="rdf-dot2" style="width:7px;height:7px;border-radius:50%;background:#FFFFFF;display:inline-block"></span><span id="rdf-stt">Smily · replies instantly</span></div></div>' +
        '<button id="rdf-book" title="Book appointment">' + calI + '</button>' +
        '<button id="rdf-x" aria-label="Close">&times;</button></div>' +
      '<div id="rdf-body"></div>' +
      '<div id="rdf-chips"></div>' +
      '<div id="rdf-foot"><div id="rdf-inwrap"><input id="rdf-in" placeholder="Type a message" autocomplete="off"/>' +
        '<button class="rdf-ic" id="rdf-mic" title="Voice">' + micI + '</button>' +
        '<button class="rdf-ic" id="rdf-clip" title="Attach a file">' + clipI + '</button></div>' +
        '<button id="rdf-send">' + sendI + '</button>' +
        '<input id="rdf-file" type="file" accept="image/*,.pdf,.doc,.docx" style="display:none"/></div>' +
    '</div>';
  document.body.appendChild(root);

  var $ = function (id) { return document.getElementById(id); };
  var body = $("rdf-body"), chipsEl = $("rdf-chips");
  function persist() { try { localStorage.setItem(LOGKEY, JSON.stringify(msgs.slice(-60))); } catch (e) {} }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function buildRow(m) {
    if (m.role === "system") return el("div", "rdf-sys", esc(m.text));
    var row = el("div", "rdf-row" + (m.role === "user" ? " me" : ""));
    if (m.role !== "user") row.appendChild(el("div", "rdf-av", m.role === "team" ? head : sparkSm));
    var wrap = el("div");
    if (m.role === "team") wrap.appendChild(el("div", "rdf-team-l", "Reception team"));
    var cls = m.role === "user" ? "me" : (m.role === "team" ? "team" : "bot");
    wrap.appendChild(el("div", "rdf-b " + cls, esc(m.text)));
    row.appendChild(wrap);
    return row;
  }
  // Append ONE message to the DOM (never rebuilds existing messages, so typing is never disturbed)
  function addRow(m) {
    if (rendered[m.ts]) return;
    rendered[m.ts] = 1;
    var anchor = $("rdf-typing");
    var node = buildRow(m);
    if (anchor) body.insertBefore(node, anchor); else body.appendChild(node);
  }
  function scrollDown() { requestAnimationFrame(function () { body.scrollTop = body.scrollHeight; }); }
  function renderChips() {
    chipsEl.innerHTML = "";
    var last = msgs[msgs.length - 1];
    if (!last || last.role !== "bot") return;
    if (last.chips) last.chips.forEach(function (c) { var b = el("button", "rdf-chip", esc(c)); b.onclick = function () { sendMsg(c); }; chipsEl.appendChild(b); });
    if (last.cta && last.cta.url) { var a = el("a", "rdf-cta", esc(last.cta.label || "Book online")); a.href = last.cta.url; a.target = "_blank"; a.rel = "noopener noreferrer"; chipsEl.appendChild(a); }
  }
  function sync() { var added = false; msgs.forEach(function (m) { if (!rendered[m.ts]) { addRow(m); added = true; } }); if (added) { renderChips(); scrollDown(); } }

  function push(role, text, extra) {
    var m = Object.assign({ role: role, text: text, ts: Date.now() + Math.random() }, extra || {});
    msgs.push(m); seen[m.ts] = 1; persist();
    addRow(m); renderChips(); scrollDown();
  }
  function typing(on) {
    var ex = $("rdf-typing"); if (ex) ex.remove();
    if (!on) return;
    var row = el("div", "rdf-row"); row.id = "rdf-typing";
    row.appendChild(el("div", "rdf-av", sparkSm));
    row.appendChild(el("div", "rdf-b bot", '<span class="rdf-dot"></span> <span class="rdf-dot" style="animation-delay:.15s"></span> <span class="rdf-dot" style="animation-delay:.3s"></span>'));
    body.appendChild(row); scrollDown();
  }
  function setMode(m) {
    if (m === mode) return; mode = m;
    $("rdf-head").className = m === "human" ? "human" : "";
    $("rdf-stt").textContent = m === "human" ? "Reception team · online" : "Smily · replies instantly";
    $("rdf-dot2").style.background = m === "human" ? "#FFE0C8" : "#FFFFFF";
    $("rdf-head").querySelector(".av").innerHTML = m === "human" ? head : spark;
  }

  function prewarm() { try { fetch(API + "/api/ping").catch(function () {}); } catch (e) {} }

  async function sendMsg(text) {
    text = (text || "").trim(); if (!text) return;
    push("user", text);
    chipsEl.innerHTML = "";
    typing(true);
    try {
      var r = await fetch(API + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: SID, message: text }) });
      var d = await r.json();
      typing(false);
      if (d.mode) setMode(d.mode);
      if (d.reply) push("bot", d.reply, { chips: d.chips || [], cta: d.cta });
    } catch (e) { typing(false); push("bot", "Sorry, I couldn't reach the clinic just now — please call (02) 9807 9800.", { chips: [] }); }
  }

  async function poll() {
    try {
      var r = await fetch(API + "/api/poll?sessionId=" + encodeURIComponent(SID));
      var d = await r.json();
      if (d.mode) setMode(d.mode);
      var fresh = false;
      (d.events || []).forEach(function (ev) { if (seen[ev.ts]) return; seen[ev.ts] = 1; msgs.push({ role: ev.role, text: ev.text, ts: ev.ts }); fresh = true; });
      if (fresh) { persist(); sync(); }   // append ONLY the new staff/system messages
    } catch (e) {}
  }


  // --- direct booking form ---
  function closeBook() { var f = $("rdf-form"); if (f) f.remove(); }
  function openBook() {
    if ($("rdf-form")) return;
    var svcs = ["General check-up & clean", "Tooth pain / emergency", "Teeth whitening", "Invisalign", "Dental implants", "Veneers / smile makeover", "Root canal", "Children's dentist", "Something else"];
    var whens = ["As soon as possible", "This week", "Next week", "I'm flexible"];
    var f = el("div"); f.id = "rdf-form";
    f.innerHTML = '<div class="rdf-fh">Book an appointment <button id="rdf-fx" aria-label="Close">&times;</button></div>' +
      '<div class="rdf-fb">' +
      '<input class="rdf-fi" id="bk-name" placeholder="Full name *"/>' +
      '<input class="rdf-fi" id="bk-phone" placeholder="Mobile * (e.g. 0412 345 678)" inputmode="tel"/>' +
      '<input class="rdf-fi" id="bk-email" placeholder="Email (optional)"/>' +
      '<select class="rdf-fi" id="bk-svc"><option value="">What do you need? *</option>' + svcs.map(function (o) { return '<option>' + o + '</option>'; }).join("") + '</select>' +
      '<select class="rdf-fi" id="bk-when"><option value="">When suits you?</option>' + whens.map(function (o) { return '<option>' + o + '</option>'; }).join("") + '</select>' +
      '<div class="rdf-seg"><button data-pt="New patient" class="on">New patient</button><button data-pt="Existing patient">Existing patient</button></div>' +
      '<button id="bk-send" class="rdf-fbtn">Send request</button>' +
      '<div class="rdf-fn">The clinic will call to confirm. Urgent? Call (02) 9807 9800.</div></div>';
    $("rdf-panel").appendChild(f);
    var pt = "New patient";
    f.querySelectorAll("[data-pt]").forEach(function (b) { b.onclick = function () { pt = b.getAttribute("data-pt"); f.querySelectorAll("[data-pt]").forEach(function (x) { x.className = ""; }); b.className = "on"; }; });
    $("rdf-fx").onclick = closeBook;
    $("bk-send").onclick = function () {
      var name = $("bk-name").value.trim(), phone = $("bk-phone").value.trim(), email = $("bk-email").value.trim(), svc = $("bk-svc").value, when = $("bk-when").value;
      if (!name || !phone || !svc) { $("bk-send").textContent = "Please add name, mobile & service"; return; }
      var bkP = auMobile(phone);
      if (!bkP) { $("bk-send").textContent = "Enter a valid AU mobile (0412 345 678)"; setTimeout(function () { $("bk-send").textContent = "Request appointment"; }, 2600); try { $("bk-phone").focus(); } catch (e) {} return; }
      phone = bkP;
      $("bk-send").textContent = "Sending…"; $("bk-send").disabled = true;
      fetch(API + "/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: SID, name: name, phone: phone, email: email, service: svc, when: when, patientType: pt }) })
        .then(function (r) { return r.json(); })
        .then(function () { closeBook(); push("bot", "Thanks " + name.split(" ")[0] + "! 🎉 Your booking request is in — the team will call " + phone + " to confirm a time. Anything else? 😊", { chips: ["Opening hours", "Where are you?"] }); })
        .catch(function () { $("bk-send").textContent = "Try again"; $("bk-send").disabled = false; });
    };
  }

  // --- intake form: capture name/mobile/email up-front, then start the chat ---
  function showIntake() {
    body.innerHTML = "";
    $("rdf-foot").style.display = "none";   // hide the message bar until details are in
    chipsEl.style.display = "none";
    body.className = "intake";
    var f = el("div"); f.id = "rdf-intake";
    f.innerHTML = '<div class="rdf-iw">' +
      '<div class="rdf-it">\uD83D\uDC4B Lovely to meet you \u2014 who am I speaking with?</div>' +
      '<div class="rdf-isub">Just a few details so our team can look after you properly.</div>' +
      '<div class="rdf-isub">Just a few quick details so we can help you properly.</div>' +
      '<input class="rdf-fi" id="in-name" placeholder="Name *" autocomplete="name"/>' +
      '<input class="rdf-fi" id="in-phone" placeholder="Mobile * (e.g. 0412 345 678)" inputmode="tel" autocomplete="tel"/>' +
      '<input class="rdf-fi" id="in-email" placeholder="Email (optional)" inputmode="email" autocomplete="email"/>' +
      '<textarea class="rdf-fi rdf-ita" id="in-msg" placeholder="Your question *"></textarea>' +
      '<label class="rdf-consent"><input type="checkbox" id="in-consent"/><span>I agree to be contacted by phone or email about my enquiry.</span></label>' +
      '<button id="in-send" class="rdf-fbtn">Start chat →</button>' +
      '<div class="rdf-fn" style="margin-top:2px">🔒 Your details stay private — used only to help with your enquiry.</div>' +
      '<div class="rdf-ierr" id="in-err"></div></div>';
    body.appendChild(f);
    $("in-send").onclick = submitIntake;
    try { $("in-name").focus(); } catch (e) {}
  }
  function submitIntake() {
    var name = $("in-name").value.trim(), phone = $("in-phone").value.trim(), email = $("in-email").value.trim(), msg = $("in-msg").value.trim(), consent = $("in-consent").checked;
    var err = $("in-err");
    if (!name || !phone || !msg) { err.textContent = "Please add your name, mobile and your question."; return; }
    var auP = auMobile(phone);
    if (!auP) { err.textContent = "That mobile doesn\u2019t look right \u2014 please enter an Australian mobile, e.g. 0412 345 678."; try { $("in-phone").focus(); } catch (e) {} return; }
    phone = auP;
    if (email && !/.+@.+\..+/.test(email)) { err.textContent = "That email doesn't look right."; return; }
    if (!consent) { err.textContent = "Please tick the box so we can reply to you."; return; }
    $("in-send").textContent = "Starting…"; $("in-send").disabled = true;
    fetch(API + "/api/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: SID, name: name, phone: phone, email: email, message: msg }) })
      .then(function (r) { return r.json(); })
      .then(function () {
        try { localStorage.setItem("rdf_contact", JSON.stringify({ name: name, phone: phone, email: email })); } catch (e) {}
        intakeDone = true; savedName = name; savedContact = { name: name, phone: phone, email: email };
        var fm = $("rdf-intake"); if (fm) fm.remove();
        body.className = "";
        $("rdf-foot").style.display = ""; chipsEl.style.display = "";
        var fn = name.split(" ")[0];
        if (msg) { push("bot", "Hi " + fn + "! 👋", {}); sendMsg(msg); }   // greet by name, then answer their question
        else push("bot", greet(fn), { chips: ["Book a visit", "Meet the dentists", "Opening hours", "Tooth pain"] });
      })
      .catch(function () { $("in-send").textContent = "Try again"; $("in-send").disabled = false; });
  }

  // --- voice ---
  function toggleMic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { push("system", "Voice needs Chrome or Edge — type away instead."); return; }
    if (listening) { recog && recog.stop(); return; }
    recog = new SR(); recog.lang = "en-AU"; recog.interimResults = true;
    recog.onresult = function (e) { var s = ""; for (var i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; $("rdf-in").value = s; };
    recog.onend = function () { listening = false; $("rdf-mic").className = "rdf-ic"; };
    try { recog.start(); listening = true; $("rdf-mic").className = "rdf-ic on"; } catch (e) {}
  }

  // --- wiring ---
  $("rdf-btn").onclick = function () {
    open = !open; $("rdf-panel").className = open ? "on" : "";
    $("rdf-btn").className = open ? "hidden" : "";
    if (open) {
      var pp = $("rdf-pop"); if (pp) pp.className = "";
      prewarm();
      if (!started) {
        started = true;
        if (msgs.length) sync();                                  // returning visitor with chat history
        else if (!intakeDone) showIntake();                       // first time → capture details before chatting
        else { // returning visitor → quietly refresh their details on the server so Smily still knows them
          try { fetch(API + "/api/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: SID, name: savedContact.name, phone: savedContact.phone, email: savedContact.email, silent: true }) }).catch(function(){}); } catch (e) {}
          push("bot", CFG_GREETING ? greet(savedName ? savedName.split(" ")[0] : "") : ("Welcome back" + (savedName ? ", " + savedName.split(" ")[0] : "") + "! 😊 How can I help you today?"), { chips: ["Book a visit", "Meet the dentists", "Tooth pain", "Opening hours"] });
        }
      }
      poll(); pollTimer = setInterval(poll, 4000);
    } else { clearInterval(pollTimer); }
  };
  $("rdf-x").onclick = function () { open = false; $("rdf-panel").className = ""; $("rdf-btn").className = ""; clearInterval(pollTimer); };
  $("rdf-book").onclick = openBook;
  $("rdf-send").onclick = function () { var v = $("rdf-in").value; $("rdf-in").value = ""; sendMsg(v); };
  $("rdf-in").addEventListener("keydown", function (e) { if (e.key === "Enter") { var v = this.value; this.value = ""; sendMsg(v); } });
  $("rdf-mic").onclick = toggleMic;
  $("rdf-clip").onclick = function () { $("rdf-file").click(); };
  $("rdf-file").onchange = function (e) { var f = e.target.files[0]; if (!f) return; e.target.value = ""; push("user", "📎 " + f.name); sendMsg("I've attached a file: " + f.name); };
  // greeting popup by the launcher — shows on every page load, new or returning visitor
  (function () {
    var pop = document.createElement("div"); pop.id = "rdf-pop";
    pop.innerHTML = '<span class="x" id="rdf-popx">&times;</span><b>Smily</b>Chat with us \uD83D\uDCAC';
    root.appendChild(pop);
    function dismiss() { pop.className = ""; }   // this page view only — it returns on the next load
    setTimeout(function () { if (!open) pop.className = "on"; }, 2500);
    pop.onclick = function (e) { if (e.target && e.target.id === "rdf-popx") { dismiss(); return; } dismiss(); $("rdf-btn").click(); };
  })();

  prewarm();
})();
