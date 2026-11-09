(function () {
  "use strict";
  var KEY = "nbf.library.v1";
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- time helpers ---------- */
  function parseTime(str) { // HH:MM:SS, or H:MM (hour:minute)
    var p = String(str == null ? "" : str).trim().split(":");
    if (p.length < 2 || p.length > 3) return null;
    var n = p.map(function (x) { return /^\d+$/.test(x.trim()) ? parseInt(x, 10) : NaN; });
    if (n.some(isNaN)) return null;
    return n[0] * 3600 + n[1] * 60 + (n[2] || 0);
  }
  function parseDur(str) { // HH:MM:SS, M:SS, or plain seconds
    var s = String(str == null ? "" : str).trim().replace(/s$/i, "");
    if (!s) return null;
    var p = s.split(":");
    var n = p.map(function (x) { return /^\d+$/.test(x.trim()) ? parseInt(x, 10) : NaN; });
    if (n.some(isNaN) || p.length > 3) return null;
    if (p.length === 1) return n[0];
    if (p.length === 2) return n[0] * 60 + n[1];
    return n[0] * 3600 + n[1] * 60 + n[2];
  }
  function fmtCenter(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h === 0 ? "0" : pad(h)) + ":" + pad(m) + (s ? ":" + pad(s) : "");
  }
  function hms(sec) { return pad(Math.floor(sec / 3600)) + ":" + pad(Math.floor((sec % 3600) / 60)) + ":" + pad(sec % 60); }

  /* ---------- break structure ---------- */
  function breaksOf(rows) {
    var out = [], bad = [];
    (rows || []).forEach(function (r, i) {
      var c = parseTime(r.c), d = parseDur(r.b);
      if (c == null || d == null || d <= 0) { bad.push(i); return; }
      out.push({ c: c, d: d });
    });
    return { list: out, bad: bad };
  }
  function tailOf(rows) {
    var list = breaksOf(rows).list;
    if (!list.length) return "with no breaks";
    var groups = {};
    list.forEach(function (b) { (groups[b.d] = groups[b.d] || []).push(b.c); });
    return Object.keys(groups).map(Number).sort(function (a, b) { return b - a; }).map(function (d) {
      var cs = groups[d].filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
      return d + "s duration @ " + cs.map(fmtCenter).join(", ");
    }).join("; ");
  }
  function lineOf(code, rows) { return "Network Format: " + (code || "CODE") + "; " + tailOf(rows); }
  function signature(rows) {
    return JSON.stringify(breaksOf(rows).list.slice().sort(function (a, b) { return a.c - b.c || a.d - b.d; }));
  }

  /* ---------- reading OCR text ---------- */
  var HEADER_WORDS = /format|center|centre|open|close|break|duration|type|name|description|asymmetric|base/i;
  var TIME_RE = /(\d{1,2})\s*[:;.,]\s*(\d{2})\s*[:;.,]\s*(\d{2})/g;
  function normTimes(line) {
    var out = [], m;
    TIME_RE.lastIndex = 0;
    while ((m = TIME_RE.exec(line))) out.push(pad(+m[1]) + ":" + m[2] + ":" + m[3]);
    return out;
  }
  function parseSnipText(text) {
    var lines = String(text || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var formats = [], cur = null;
    function start(name) { cur = { name: name || "", duration: "", rows: [], flagged: 0 }; formats.push(cur); }
    lines.forEach(function (line) {
      var fn = /format\s*name\s*[:;.]?\s*(.*)$/i.exec(line);
      if (fn) {
        var rest = fn[1];
        var nm = /^(.*?)\s*(?:description|duration|asymmetric|base)\b/i.exec(rest);
        start((nm ? nm[1] : rest).replace(/^[:;.\s]+|[\s|]+$/g, ""));
        var du = /duration\s*[:;.]?\s*(\d{1,2}\s*[:;.,]\s*\d{2}\s*[:;.,]\s*\d{2})/i.exec(rest);
        if (du) cur.duration = normTimes(du[1])[0] || "";
        return;
      }
      if (/^\s*(center|centre)\s*time/i.test(line)) return;
      var letters = (line.match(/[A-Za-z]/g) || []).length;
      var clean = line.replace(/\|/g, " ");
      if (!HEADER_WORDS.test(clean) || letters <= 4) clean = clean.replace(/[Oo]/g, "0").replace(/[lI]/g, "1");
      var times = normTimes(clean);
      if (!times.length) return;
      if (/duration/i.test(clean) && times.length === 1 && cur && !cur.duration) { cur.duration = times[0]; return; }
      if (HEADER_WORDS.test(line) && letters > 6) return;
      if (!cur) start("");
      var row = { c: times[0] || "", o: times[1] || "", x: times[2] || "", b: times[3] || "" };
      if (times.length < 4) cur.flagged++;
      cur.rows.push(row);
    });
    return formats;
  }
  window.parseSnipText = parseSnipText;

  /* ---------- storage ---------- */
  function mkRows(centers, dur) { return centers.map(function (c) { return { c: hms(c * 60), o: "", x: "", b: hms(dur) }; }); }
  function examples() {
    return {
      "CFTB": { code: "CFTB", snipName: "College Football", duration: "", rows: mkRows([15, 45, 75, 105, 135, 165], 60), savedAt: 0 },
      "NB30": { code: "NB30", snipName: "College Football Scoreboard", duration: "00:30:00", rows: [], savedAt: 0 },
      "SC-1": { code: "SC-1", snipName: "SportsCenter", duration: "", rows: mkRows([15, 31, 45], 60), savedAt: 0 },
      "WVOL": { code: "WVOL", snipName: "Women's College Volleyball", duration: "", rows: mkRows([15, 45, 75, 105], 60), savedAt: 0 }
    };
  }
  var EXAMPLE_PROG = [
    "11/14/2026 03:00 PM to 06:00 PM “College Football” format CFTB",
    "11/14/2026 06:00 PM to 06:30 PM “College Football Scoreboard” format NB30",
    "11/15/2026 12:30 AM to 01:30 AM “SportsCenter” format SC-1",
    "11/15/2026 08:00 PM to 10:00 PM “Women's College Volleyball” format WVOL",
    "11/16/2026 07:00 PM to 09:00 PM “Poker Night” format PKR-9"
  ].join("\n");
  var library = {}, memoryOnly = false;
  function loadLib() {
    try { var raw = localStorage.getItem(KEY); library = raw ? (JSON.parse(raw) || {}) : {}; }
    catch (e) { memoryOnly = true; library = {}; }
  }
  function saveLib() { try { localStorage.setItem(KEY, JSON.stringify(library)); } catch (e) { memoryOnly = true; } }

  /* ---------- toast / copy / download ---------- */
  var toastT;
  function toast(t) { var el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2600); }
  function copyText(text) {
    function fallback() {
      try {
        var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); document.body.removeChild(ta);
        toast(ok ? "Copied" : "Select the text and copy it by hand");
      } catch (e) { toast("Select the text and copy it by hand"); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast("Copied"); }, fallback);
    else fallback();
  }
  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- tabs ---------- */
  function showTab(name) {
    ["read", "lib", "prog", "help"].forEach(function (t) {
      $("#p-" + t).hidden = t !== name;
      $("#tab-" + t).setAttribute("aria-selected", t === name ? "true" : "false");
    });
    if (name === "lib") renderLib();
    if (name === "prog") renderProg();
  }
  document.querySelector("nav.tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-tab]"); if (b) showTab(b.dataset.tab); });

  /* ---------- drafts ---------- */
  var drafts = [], nextId = 1;
  function newDraft(o) {
    var d = Object.assign({ id: nextId++, status: "ready", code: "", snipName: "", duration: "", rows: [], thumb: "", fileName: "", err: "", confirm: false, note: "", raw: "", progress: 0, stage: "" }, o || {});
    drafts.push(d); return d;
  }
  function blankRow() { return { c: "", o: "00:00:00", x: "", b: "00:01:00" }; }
  function draftById(el) { var a = el.closest("[data-id]"); if (!a) return null; var id = +a.dataset.id; return drafts.filter(function (x) { return x.id === id; })[0]; }
  function cardOf(d) { return document.querySelector('#drafts [data-id="' + d.id + '"]'); }

  function draftHTML(d) {
    var img = d.thumb ? '<div class="snipbox"><img alt="Your snip" src="' + d.thumb + '"></div>' : "";
    if (d.status === "reading") {
      return '<article class="card" data-id="' + d.id + '"><div class="cmp' + (img ? " has-img" : "") + '">' + img +
        '<div class="spin"><i></i><div><span data-stage>' + esc(d.stage || "Starting…") + '</span><div class="bar"><b data-bar style="width:' + Math.round(d.progress * 100) + '%"></b></div></div></div></div></article>';
    }
    if (d.status === "error") {
      return '<article class="card" data-id="' + d.id + '"><div class="cmp' + (img ? " has-img" : "") + '">' + img +
        '<div><span class="chip bad">Could not read</span><p class="msg bad">' + esc(d.err) + '</p>' +
        '<div class="actions"><button class="btn sm" data-act="manual">Enter rows by hand</button><button class="btn sm" data-act="discard">Discard</button></div></div></div></article>';
    }
    var rows = d.rows.map(function (r, i) {
      return '<tr data-r="' + i + '">' +
        '<td data-k="c"><input type="text" data-k="c" value="' + esc(r.c) + '" aria-label="Center time row ' + (i + 1) + '" inputmode="numeric"></td>' +
        '<td><input type="text" data-k="o" value="' + esc(r.o) + '" aria-label="Open time row ' + (i + 1) + '"></td>' +
        '<td><input type="text" data-k="x" value="' + esc(r.x) + '" aria-label="Close time row ' + (i + 1) + '"></td>' +
        '<td data-k="b"><input type="text" data-k="b" value="' + esc(r.b) + '" aria-label="Break duration row ' + (i + 1) + '"></td>' +
        '<td class="x"><button class="xbtn" data-act="delrow" aria-label="Remove row ' + (i + 1) + '">×</button></td></tr>';
    }).join("");
    var chips = d.note ? '<span class="chip info">' + esc(d.note) + "</span>" : "";
    var raw = d.raw ? '<details class="raw"><summary>Text the reader saw</summary><pre>' + esc(d.raw) + "</pre></details>" : "";
    return '<article class="card" data-id="' + d.id + '"><div class="cmp' + (img ? " has-img" : "") + '">' + img + '<div style="min-width:0">' +
      '<div class="fields">' +
      '<label>Network Format<input type="text" data-f="code" value="' + esc(d.code) + '" placeholder="e.g. 180-8" autocomplete="off" spellcheck="false"></label>' +
      '<label>Duration<input type="text" data-f="duration" value="' + esc(d.duration) + '" placeholder="03:00:00" autocomplete="off"></label>' +
      '<label>Description (optional)<input type="text" class="plain" data-f="snipName" value="' + esc(d.snipName) + '" autocomplete="off"></label>' +
      "</div>" + (chips ? '<p style="margin:0 0 10px">' + chips + "</p>" : "") +
      '<div class="tablewrap"><table><thead><tr><th>Center Time</th><th>Open Time</th><th>Close Time</th><th>Break Duration</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<div class="actions"><button class="btn sm" data-act="addrow">Add row</button></div></div></div>' +
      '<div class="preview"><span class="lbl">Output line</span><code class="line" data-line></code>' +
      '<div class="btnrow"><button class="btn sm" data-act="copyline">Copy line</button></div></div>' +
      '<p class="msg" data-msg></p>' +
      '<div class="actions"><button class="btn primary" data-act="save" data-save>Save to library</button><button class="btn" data-act="discard">Discard</button></div>' + raw + "</article>";
  }
  function renderDrafts() {
    var box = $("#drafts");
    if (!drafts.length) { box.innerHTML = '<div class="empty">No snips yet. Drop one above and its rows appear here for checking.</div>'; return; }
    box.innerHTML = drafts.map(draftHTML).join("");
    drafts.forEach(function (d) { if (d.status === "ready") refreshDraft(d); });
  }
  function refreshDraft(d) {
    var card = cardOf(d); if (!card || d.status !== "ready") return;
    var b = breaksOf(d.rows), code = d.code.trim().toUpperCase();
    card.querySelector("[data-line]").textContent = lineOf(code || "CODE", d.rows);
    var outOfWindow = 0;
    card.querySelectorAll("tbody tr").forEach(function (tr, i) {
      var r = d.rows[i], bad = b.bad.indexOf(i) >= 0;
      tr.querySelector('td[data-k="c"]').classList.toggle("bad", bad && parseTime(r.c) == null);
      tr.querySelector('td[data-k="b"]').classList.toggle("bad", bad && parseDur(r.b) == null);
      var c = parseTime(r.c), o = parseTime(r.o), x = parseTime(r.x);
      if (c != null && ((o != null && c < o) || (x != null && c > x + 59))) outOfWindow++;
    });
    var msg = card.querySelector("[data-msg]"), btn = card.querySelector("[data-save]"), text = "", cls = "msg";
    if (b.bad.length) { text = b.bad.length + " row" + (b.bad.length > 1 ? "s" : "") + " with a missing or unreadable center or break time (marked red) are left out of the line."; cls = "msg warn"; }
    else if (outOfWindow) { text = outOfWindow + " center time" + (outOfWindow > 1 ? "s" : "") + " fall outside that row's open and close times. Check them against the snip."; cls = "msg warn"; }
    else if (d.rows.length) text = d.rows.length + " row" + (d.rows.length > 1 ? "s" : "") + ". Compare with the snip before saving.";
    var ex = code && library[code];
    btn.textContent = "Save to library";
    if (ex) {
      if (signature(ex.rows) === signature(d.rows)) { text = code + " is already saved with these same breaks."; cls = "msg"; btn.textContent = "Update " + code; }
      else { text = code + " is saved with different breaks. " + (d.confirm ? "Press Replace to overwrite it." : "Saving will ask you to confirm."); cls = "msg warn"; btn.textContent = d.confirm ? "Replace " + code : "Save to library"; }
    } else if (code && b.list.length) {
      var twin = Object.keys(library).filter(function (k) { return signature(library[k].rows) === signature(d.rows); });
      if (twin.length) { text = "Same breaks as saved " + twin.join(", ") + ". Save only if this is a separate format."; cls = "msg warn"; }
    }
    msg.className = cls; msg.textContent = text;
  }
  $("#drafts").addEventListener("input", function (e) {
    var d = draftById(e.target); if (!d) return;
    var f = e.target.dataset.f, k = e.target.dataset.k;
    if (f) { d[f] = e.target.value; d.confirm = false; }
    else if (k) { d.rows[+e.target.closest("tr").dataset.r][k] = e.target.value; }
    refreshDraft(d);
  });
  $("#drafts").addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var d = draftById(b); if (!d) return;
    var act = b.dataset.act;
    if (act === "discard") { drafts = drafts.filter(function (x) { return x !== d; }); renderDrafts(); }
    else if (act === "addrow") { d.rows.push(blankRow()); renderDrafts(); }
    else if (act === "delrow") { d.rows.splice(+b.closest("tr").dataset.r, 1); renderDrafts(); }
    else if (act === "manual") { d.status = "ready"; d.rows = [blankRow()]; renderDrafts(); }
    else if (act === "copyline") copyText(lineOf(d.code.trim().toUpperCase() || "CODE", d.rows));
    else if (act === "save") saveDraft(d);
  });
  function saveDraft(d) {
    var code = d.code.trim().toUpperCase(), card = cardOf(d), msg = card.querySelector("[data-msg]");
    if (!code) { msg.className = "msg bad"; msg.textContent = "Enter the Network Format (for example 180-8) before saving."; card.querySelector('[data-f="code"]').focus(); return; }
    if (/\s|;/.test(code)) { msg.className = "msg bad"; msg.textContent = "The Network Format cannot contain spaces or semicolons."; return; }
    var ex = library[code];
    if (ex && signature(ex.rows) !== signature(d.rows) && !d.confirm) { d.confirm = true; refreshDraft(d); return; }
    library[code] = { code: code, snipName: d.snipName.trim(), duration: d.duration.trim(), rows: d.rows.map(function (r) { return { c: r.c.trim(), o: r.o.trim(), x: r.x.trim(), b: r.b.trim() }; }), savedAt: Date.now() };
    saveLib();
    drafts = drafts.filter(function (x) { return x !== d; });
    renderDrafts(); updateCount();
    toast(code + " saved to the library" + (memoryOnly ? " (this session only)" : ""));
  }

  /* ---------- reading snips (in-browser OCR) ---------- */
  var workerP = null, currentJob = null;
  function getWorker() {
    if (workerP) return workerP;
    var base = new URL("vendor/tesseract/", location.href).href;
    workerP = Tesseract.createWorker("eng", 1, {
      workerPath: base + "worker.min.js", corePath: base + "core/", langPath: base + "lang/", gzip: false,
      logger: function (m) { if (currentJob) onProgress(currentJob, m); }
    }).then(function (w) {
      return w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" }).then(function () { return w; });
    });
    workerP.catch(function () { workerP = null; });
    return workerP;
  }
  function onProgress(d, m) {
    var label = m.status === "recognizing text" ? "Reading the snip…" : (/loading|initializ/i.test(m.status) ? "Loading the reader (first time only)…" : "Preparing…");
    d.stage = label; d.progress = Math.max(d.progress || 0, m.progress || 0);
    var card = cardOf(d); if (!card) return;
    var s = card.querySelector("[data-stage]"), bar = card.querySelector("[data-bar]");
    if (s) s.textContent = label; if (bar) bar.style.width = Math.round((m.progress || 0) * 100) + "%";
  }
  function prepImage(file) { // upscale and boost contrast so small table text reads cleanly
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var target = 2400, scale = Math.min(3, Math.max(1, target / img.naturalWidth));
        var cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
        var ctx = cv.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, 0, 0, cv.width, cv.height);
        var id = ctx.getImageData(0, 0, cv.width, cv.height), p = id.data;
        for (var i = 0; i < p.length; i += 4) {
          var g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
          g = g < 150 ? Math.max(0, g - 60) : Math.min(255, g + 70);
          p[i] = p[i + 1] = p[i + 2] = g;
        }
        ctx.putImageData(id, 0, 0); URL.revokeObjectURL(url);
        cv.toBlob(function (b) { b ? resolve(b) : reject(new Error("Could not prepare the image.")); }, "image/png");
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("That file could not be opened as an image.")); };
      img.src = url;
    });
  }
  var queue = Promise.resolve();
  function readImage(file) {
    var d = newDraft({ status: "reading", fileName: file.name || "pasted snip", thumb: URL.createObjectURL(file), stage: "Waiting…" });
    renderDrafts();
    queue = queue.then(function () { return processDraft(d, file); });
  }
  async function processDraft(d, file) {
    if (drafts.indexOf(d) < 0) return;
    currentJob = d;
    try {
      if (typeof Tesseract === "undefined") throw new Error("The reader did not load. Reload the page and try again.");
      d.stage = "Preparing the image…"; var cardA = cardOf(d); if (cardA) cardA.querySelector("[data-stage]").textContent = d.stage;
      var blob = await prepImage(file);
      var w = await getWorker();
      var res = await w.recognize(blob);
      var text = res.data.text || "";
      var fm = parseSnipText(text).filter(function (f) { return f.rows.length || f.name; });
      if (!fm.length || !fm.some(function (f) { return f.rows.length; })) {
        d.status = "error"; d.raw = text;
        d.err = "No break rows were found in that image. Use a clear screenshot of the table, or enter the rows by hand.";
      } else {
        var at = drafts.indexOf(d);
        var made = fm.map(function (f, i) {
          var o = { status: "ready", code: f.name, duration: f.duration, rows: f.rows, fileName: d.fileName, thumb: d.thumb, raw: text,
            note: "Read from " + d.fileName + (f.flagged ? " · " + f.flagged + " row" + (f.flagged > 1 ? "s" : "") + " incomplete" : "") };
          return i === 0 ? Object.assign(d, o) : Object.assign({ id: nextId++, snipName: "", err: "", confirm: false, progress: 0, stage: "" }, o);
        });
        if (made.length > 1) drafts.splice.apply(drafts, [at + 1, 0].concat(made.slice(1)));
      }
    } catch (e) {
      d.status = "error"; d.err = (e && e.message) ? e.message : "The snip could not be read. Enter the rows by hand.";
    }
    currentJob = null;
    renderDrafts();
  }
  function takeFiles(list) {
    var imgs = Array.prototype.filter.call(list || [], function (f) { return /^image\//.test(f.type); });
    if (!imgs.length) { toast("Those files are not images"); return; }
    showTab("read"); imgs.forEach(readImage);
  }
  $("#file").addEventListener("change", function (e) { takeFiles(e.target.files); e.target.value = ""; });
  $("#blank").addEventListener("click", function () { newDraft({ rows: [blankRow()], note: "Entered by hand" }); renderDrafts(); });
  var drop = $("#drop");
  ["dragenter", "dragover"].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { takeFiles(e.dataTransfer && e.dataTransfer.files); });
  document.addEventListener("paste", function (e) {
    if (/^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || "")) return;
    var items = (e.clipboardData && e.clipboardData.items) || [], files = [];
    for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) files.push(items[i].getAsFile());
    if (files.length) { e.preventDefault(); takeFiles(files); }
  });

  /* ---------- library ---------- */
  function updateCount() { var n = Object.keys(library).length; $("#libcount").textContent = n ? "(" + n + ")" : ""; }
  var delArm = null;
  function renderLib() {
    var keys = Object.keys(library).sort(), box = $("#lib");
    if (!keys.length) box.innerHTML = '<div class="empty">No saved formats yet. Read a snip and save it under its Network Format, or load the example formats.</div>';
    else box.innerHTML = keys.map(function (k) {
      var f = library[k], n = breaksOf(f.rows).list.length;
      return '<article class="card" data-code="' + esc(k) + '"><div class="head"><span class="code">' + esc(k) + '</span><span class="meta">' +
        [f.snipName, f.duration, n + (n === 1 ? " break" : " breaks")].filter(Boolean).map(esc).join(" · ") + "</span></div>" +
        '<code class="line">' + esc(lineOf(k, f.rows)) + "</code>" +
        '<div class="btnrow"><button class="btn sm" data-act="copy">Copy line</button><button class="btn sm" data-act="edit">Edit</button>' +
        '<button class="btn sm danger" data-act="del">' + (delArm === k ? "Confirm delete" : "Delete") + "</button></div></article>";
    }).join("");
    updateCount();
  }
  $("#lib").addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var k = b.closest("[data-code]").dataset.code, f = library[k], act = b.dataset.act;
    if (act === "copy") copyText(lineOf(k, f.rows));
    else if (act === "edit") {
      newDraft({ code: k, snipName: f.snipName, duration: f.duration, rows: f.rows.map(function (r) { return Object.assign({}, r); }), note: "Editing saved " + k });
      showTab("read"); renderDrafts(); window.scrollTo(0, 0);
    } else if (act === "del") {
      if (delArm === k) { delete library[k]; saveLib(); delArm = null; toast(k + " deleted"); } else delArm = k;
      renderLib();
    }
  });
  $("#loadex").addEventListener("click", function () {
    var ex = examples(), n = 0;
    Object.keys(ex).forEach(function (k) { if (!library[k]) { library[k] = ex[k]; n++; } });
    saveLib(); renderLib(); $("#bkmsg").textContent = n ? n + " example format" + (n === 1 ? "" : "s") + " added." : "Examples are already in the library.";
  });
  $("#bkexport").addEventListener("click", function () {
    if (!Object.keys(library).length) { $("#bkmsg").textContent = "Nothing to export yet."; return; }
    download("break-formats.json", JSON.stringify(library, null, 2), "application/json");
  });
  $("#bkfile").addEventListener("change", function (e) {
    var f = e.target.files[0]; e.target.value = ""; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var data = JSON.parse(rd.result), n = 0;
        Object.keys(data).forEach(function (k) {
          var v = data[k];
          if (v && Array.isArray(v.rows)) { var K = String(k).toUpperCase(); library[K] = { code: K, snipName: v.snipName || "", duration: v.duration || "", rows: v.rows, savedAt: Date.now() }; n++; }
        });
        saveLib(); renderLib(); $("#bkmsg").textContent = n + " format" + (n === 1 ? "" : "s") + " imported.";
      } catch (err) { $("#bkmsg").textContent = "That file is not a valid export."; }
    };
    rd.readAsText(f);
  });

  /* ---------- program file ---------- */
  var FMT = /^(.*?\bformat\s+)([A-Za-z0-9][A-Za-z0-9_\-]*)(.*)$/i;
  var lastResults = [];
  function renderProg() {
    var lines = $("#progin").value.split(/\r?\n/).filter(function (l) { return l.trim(); });
    lastResults = lines.map(function (l) {
      var m = FMT.exec(l);
      if (!m) return { out: l, state: "nocode" };
      var code = m[2].toUpperCase(), f = library[code];
      if (!f) return { out: l, state: "missing", code: code };
      var tail = tailOf(f.rows);
      return { out: m[1] + code + "; " + tail + (tail === "with no breaks" || /\.\s*$/.test(m[3]) ? "." : ""), state: "ok", code: code };
    });
    var ok = lastResults.filter(function (r) { return r.state === "ok"; }).length;
    $("#progsum").textContent = lines.length ? "· " + ok + " of " + lines.length + " lines ready" : "";
    $("#progout").innerHTML = lastResults.length ? lastResults.map(function (r) {
      var chip = r.state === "ok" ? '<span class="chip ok">' + esc(r.code) + " applied</span>" :
        r.state === "missing" ? '<span class="chip warn">' + esc(r.code) + " not saved yet</span>" : '<span class="chip bad">No “format CODE” found</span>';
      return '<div class="item' + (r.state === "ok" ? "" : " miss") + '">' + chip + '<span class="txt">' + esc(r.out) + "</span></div>";
    }).join("") : '<div class="meta">Paste program lines on the left.</div>';
  }
  $("#progin").addEventListener("input", renderProg);
  $("#progex").addEventListener("click", function () { $("#progin").value = EXAMPLE_PROG; renderProg(); });
  $("#progcopy").addEventListener("click", function () { if (lastResults.length) copyText(lastResults.map(function (r) { return r.out; }).join("\n")); });
  $("#progdl").addEventListener("click", function () { if (lastResults.length) download("programs-with-breaks.txt", lastResults.map(function (r) { return r.out; }).join("\n") + "\n"); });

  /* ---------- boot ---------- */
  loadLib(); updateCount(); renderDrafts();
  if (memoryOnly) toast("Storage is blocked in this browser, so saved formats last for this visit only");
  window.__nbf = { library: function () { return library; }, drafts: function () { return drafts; } };
})();
