// Team songbook (media team testers): add a song by typing or from a photo, suggest corrections.
// Songs go to the church's private "song inbox" on GitHub; the media desk approves them and publishes the library.
import { makeSong } from "./song-import.js";
import { textToSections, sectionsToText } from "./song-text.js";
import { romanize, capitalizeLines } from "./translit.js";

const pref = (k, d) => { try { return localStorage.getItem("sbt-" + k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem("sbt-" + k, v); } catch { } };
const API = () => pref("api", "https://api.github.com").replace(/\/$/, "");
const INBOX = () => pref("inbox", "capstoneen04/revival-song-inbox");
const isDeva = (s) => /[ऀ-ॿ]/.test(s || "");
const b64 = (str) => { const bytes = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const sid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function init(app) {
  const { kv, esc, $ } = app;
  let queue = [];                                            // [{ id, kind, song, by, at, note, state: "queued" | "sent" }]
  // states: queued (not sent) → sent (waiting) → approved (desk said yes, comes with the next library update) → done (in this songbook)
  //         or merged (it was already in the songbook; that song was updated) / rejected
  const save = async () => { await kv.set("team-queue", queue); app.setPending(queue.filter(q => q.kind === "new" && ["queued", "sent", "approved"].includes(q.state))); bar(); };

  // ---------- header buttons ----------
  const css = document.createElement("style");
  css.textContent = `.tm{position:fixed;inset:0;z-index:20;background:var(--bg);overflow:auto;padding:calc(12px + env(safe-area-inset-top)) 16px 40px}
  .tm .in{max-width:720px;margin:0 auto} .tm h2{margin:6px 0 12px;font-size:20px} .tm label{display:block;font-size:13px;color:var(--muted);margin:12px 0 4px}
  .tm textarea{width:100%;min-height:42vh;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:12px;font:inherit;font-size:16px;line-height:1.5}
  .tm .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap} .tm .row>*{flex:1} .tm .hint{font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.45}
  .tm .bar{display:flex;gap:8px;margin-top:16px} .tm .bar button{flex:1} .pbtn{height:44px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit;font-size:15px}
  .pbtn.pri{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600} .tm select{height:44px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:0 10px;font:inherit;font-size:15px}
  .ocrst{font-size:13px;color:var(--muted);min-height:18px;margin-top:8px} .mine{border-bottom:1px solid var(--line);padding:10px 0} .mine b{display:block}`;
  document.head.appendChild(css);
  const tb = $("teambar");
  tb.innerHTML = `<button class="ib" id="t-add" title="Add a song">＋ Add</button><button class="ib" id="t-mine" title="My songs for the media team">Mine</button>`;
  $("t-add").onclick = () => editor();
  $("t-mine").onclick = mine;
  function bar() { const n = queue.filter(q => q.state === "queued" || q.state === "sent").length; $("t-mine").textContent = n ? `Mine (${n})` : "Mine"; }

  kv.get("team-queue").then(q => { queue = q || []; if (app.songs().length) markDone(); save(); flush(); });
  addEventListener("online", flush);

  // a sent song is "done" once the published library contains it (approved by the media desk)
  function markDone() {
    const byId = new Map(app.songs().map(s => [s.id, s]));
    for (const q of queue) {
      if (q.state !== "sent" && q.state !== "approved") continue;
      const id = q.decision?.songId || q.song.id, s = byId.get(id);
      if (s && String(s.updated || "") >= String(q.song.updated || "")) { q.state = q.decision?.state === "merged" ? "merged" : "done"; q.decision = { ...(q.decision || {}), book: (s.books || []).map(b => b.book + " " + b.num).join(", ") }; }
    }
    queue = queue.filter(q => ["queued", "sent", "approved"].includes(q.state) || Date.now() - new Date(q.at) < 14 * 864e5);
  }
  // what did the media desk decide? (decisions/<id>.json in the song inbox)
  async function checkDecisions() {
    if (!navigator.onLine || !(await kv.get("team-key"))) return;
    let changed = false;
    for (const q of queue.filter(q => q.state === "sent")) {
      try {
        const r = await fetch(`${API()}/repos/${INBOX()}/contents/decisions/${q.id}.json`, { headers: { authorization: "Bearer " + await kv.get("team-key"), accept: "application/vnd.github.raw" }, cache: "no-store" });
        if (!r.ok) continue;
        const d = await r.json(); q.decision = d; q.state = ["rejected", "merged", "added"].includes(d.state) ? d.state : "approved"; changed = true;
      } catch { }
    }
    if (changed) { markDone(); await save(); }
  }

  // ---------- who am I ----------
  function setup(then) {
    const box = screen(`<h2>Team songbook</h2>
      <p class="hint">For the media team testers. Songs you add are sent to the media desk; after approval they reach every computer and phone.</p>
      <label>Your name</label><input id="t-name" value="${esc(pref("name", ""))}" placeholder="e.g. Br. Enoch">
      <label>Team key (from the media team)</label><input id="t-key" type="password" placeholder="github_pat_…" autocomplete="off">
      <div class="hint">The key lets this phone send songs to the church's private song inbox. Keep it to yourself.</div>
      <div class="bar"><button class="pbtn" id="t-x">Cancel</button><button class="pbtn pri" id="t-ok">Save</button></div><div class="ocrst" id="t-st"></div>`);
    box.querySelector("#t-x").onclick = () => box.remove();
    box.querySelector("#t-ok").onclick = async () => {
      const name = box.querySelector("#t-name").value.trim(), key = box.querySelector("#t-key").value.trim() || await kv.get("team-key");
      if (!name || !key) { box.querySelector("#t-st").textContent = "Enter your name and the team key."; return; }
      box.querySelector("#t-st").textContent = "Checking the key…";
      try { await gh("GET", `/repos/${INBOX()}`, null, key); } catch (e) { box.querySelector("#t-st").textContent = e.message; return; }
      setPref("name", name); await kv.set("team-key", key); box.remove(); then?.();
    };
  }
  async function gh(method, url, body, key) {
    key = key || await kv.get("team-key");
    const r = await fetch(API() + url, { method, headers: { authorization: "Bearer " + key, accept: "application/vnd.github+json", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) throw new Error("The team key is not valid (expired or mistyped).");
    if (r.status === 403 || r.status === 404) throw new Error("This key has no access to the song inbox — ask the media team.");
    if (!r.ok) throw new Error("GitHub error " + r.status);
    return r.json();
  }
  async function flush() {
    if (!navigator.onLine || !(await kv.get("team-key"))) return;
    let changed = false;
    for (const q of queue.filter(q => q.state === "queued")) {
      try {
        let sha;
        if (q.update) {                           // replace the waiting file; if the desk already took it, the decision is checked below
          const cur = await fetch(`${API()}/repos/${INBOX()}/contents/inbox/${q.id}.json`, { headers: { authorization: "Bearer " + await kv.get("team-key"), accept: "application/vnd.github+json" }, cache: "no-store" });
          if (cur.ok) sha = (await cur.json()).sha;
          else { const dec = await fetch(`${API()}/repos/${INBOX()}/contents/decisions/${q.id}.json`, { headers: { authorization: "Bearer " + await kv.get("team-key") }, cache: "no-store" }); if (dec.ok) { q.id = sid(); q.kind = "edit"; } }
        }
        await gh("PUT", `/repos/${INBOX()}/contents/inbox/${q.id}.json`, { ...(sha ? { sha } : {}), message: `${{ new: "New song", edit: "Correction", setlist: "Set list" }[q.kind]}: ${q.song.title} (${q.by})`, content: b64(JSON.stringify({ v: 1, kind: q.kind, song: q.song, setlist: q.setlist, by: q.by, at: q.at, note: q.note }, null, 1)) });
        q.state = "sent"; delete q.update; changed = true;
      } catch (e) { console.warn(e); break; }
    }
    if (changed) save();
    await checkDecisions();
  }

  // ---------- screens ----------
  function screen(html) { const d = document.createElement("div"); d.className = "tm"; d.innerHTML = `<div class="in">${html}</div>`; document.body.appendChild(d); return d; }

  async function editor(edit) {
    if (!(await kv.get("team-key")) || !pref("name", "")) return setup(() => editor(edit));
    const song = edit?.song, lang = edit?.lang;
    const v = song ? song.versions[lang] : null;
    const books = song?.books?.[0];
    const box = screen(`<button class="back" id="t-back">‹ Back</button>
      <h2>${song ? "Correct this song" : "Add a song"}</h2>
      <label>Title</label><input id="t-title" value="${esc(v?.title || "")}" placeholder="Song title">
      <div class="row"><div><label>Key (optional)</label><input id="t-keyx" value="${esc(song?.key || "")}" placeholder="e.g. G"></div>
        <div><label>Book & number (optional)</label><input id="t-book" value="${esc(books ? books.book + " " + books.num : "")}" placeholder="e.g. SK 12"></div></div>
      <label>Lyrics</label>
      <div class="row" style="margin-bottom:8px"><button class="pbtn" id="t-photo">📷 Photo → text</button><select id="t-olang"><option value="hin+eng">Hindi + English</option><option value="hin">Hindi</option><option value="eng">English</option><option value="mar">Marathi</option></select></div>
      <button class="pbtn" id="t-hing" style="width:100%;margin-bottom:8px">Hinglish → हिंदी (typed in English letters)</button>
      <input type="file" id="t-file" accept="image/*" hidden>
      <div class="ocrst" id="t-ost"></div>
      <textarea id="t-text" placeholder="[Verse 1]\nfirst line\nsecond line\n\n[Chorus]\n…">${esc(v ? sectionsToText(v.sections) : "")}</textarea>
      <div class="hint">Put [Verse 1], [Chorus], [Bridge] above each part (or “Chorus” on its own line). Chords optional: [G]Amazing [C]grace. Hindi gets its Hinglish version made automatically.</div>
      <label>Note for the media team (optional)</label><input id="t-note" placeholder="${song ? "What did you correct?" : "Where is this song from?"}">
      <div class="bar"><button class="pbtn" id="t-cancel">Cancel</button><button class="pbtn pri" id="t-send">${song ? "Send correction" : "Send to media team"}</button></div>
      <div class="ocrst" id="t-st"></div>`);
    const q = (s) => box.querySelector(s);
    q("#t-olang").value = pref("olang", "hin+eng");
    q("#t-back").onclick = q("#t-cancel").onclick = () => box.remove();
    q("#t-photo").onclick = () => q("#t-file").click();
    q("#t-file").onchange = () => photo(q("#t-file").files[0], q);
    q("#t-hing").onclick = async () => {
      const { loadHinglishDict, hinglishToHindi, looksHinglish } = await import("./hinglish.js");
      const ta = q("#t-text"); if (!looksHinglish(ta.value)) { q("#t-ost").textContent = "Type or paste the Hinglish lyrics first."; return; }
      const dict = await loadHinglishDict("hinglish-dict.json");
      const body = hinglishToHindi(ta.value, dict), head = hinglishToHindi(q("#t-title").value, dict);
      ta.value = body.text; if (q("#t-title").value) q("#t-title").value = head.text;
      const unk = [...new Set([...head.unknown, ...body.unknown])];
      q("#t-ost").textContent = unk.length ? `Converted. Please check: ${unk.join(", ")}` : "Converted — please read it through once.";
    };
    q("#t-send").onclick = async () => {
      const title = q("#t-title").value.trim(), text = q("#t-text").value.trim();
      if (!title || !text) { q("#t-st").textContent = "Add a title and the lyrics."; return; }
      const sections = textToSections(text); if (!sections.length) { q("#t-st").textContent = "No lyrics found."; return; }
      const by = pref("name", ""); const now = new Date().toISOString();
      let out;
      if (song) {
        out = JSON.parse(JSON.stringify(song)); delete out._pending; delete out._score;
        out.versions[lang] = { ...out.versions[lang], title, sections };
        if (lang === "hi") out.versions["hi-Latn"] = { title: capitalizeLines(romanize(title)), sections: sections.map(s => ({ label: s.label, lines: capitalizeLines(romanize(s.lines.join("\n"))).split("\n") })) };
        if (lang === song.lang) out.title = title;
      } else {
        out = makeSong({ title, sections, source: "team:" + by });
        if (!out) { q("#t-st").textContent = "No lyrics found."; return; }
        delete out.fixedKruti; out.id = "t" + sid(); out.status = "review"; out.books = [];
      }
      out.key = q("#t-keyx").value.trim();
      const bk = q("#t-book").value.trim().match(/^([A-Za-z]+)\s*(\d+)$/); if (bk) out.books = [{ book: bk[1].toUpperCase(), num: +bk[2] }];
      out.updated = now;
      // correcting a song that is still waiting at the media desk → update that same submission (no pile of copies in the inbox)
      const waiting = song && queue.find(x => x.song.id === song.id && (x.state === "queued" || x.state === "sent"));
      if (waiting) { waiting.song = out; waiting.at = now; waiting.note = [waiting.note, q("#t-note").value.trim()].filter(Boolean).join(" · "); if (waiting.state === "sent") waiting.update = true; waiting.state = "queued"; queue.push(queue.splice(queue.indexOf(waiting), 1)[0]); }
      else queue.push({ id: sid(), kind: song ? "edit" : "new", song: out, by, at: now, note: q("#t-note").value.trim(), state: "queued" });
      await save(); box.remove(); await flush();
      const sent = queue.at(-1).state === "sent";
      toastMsg(sent ? "Sent to the media team ✓" : "Saved on this phone — it will be sent when you are online");
      if (!song) app.open(out.id); else app.refreshView();
    };
  }

  async function photo(file, q) {
    if (!file) return;
    const st = q("#t-ost"); st.textContent = "Loading the text reader (first time ~15 MB)…";
    setPref("olang", q("#t-olang").value);
    try {
      const { getWorker, prepCanvas, cleanOcr, smartMarkup } = await import("./ocr-core.js");
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Could not open the photo")); i.src = URL.createObjectURL(file); });
      const langs = q("#t-olang").value.split("+");
      const w = await getWorker(langs, (m) => { if (m.status) st.textContent = m.status.replace(/^./, c => c.toUpperCase()) + (m.progress ? ` ${Math.round(m.progress * 100)}%` : ""); }, new URL("./", location.href).href);
      const { data } = await w.recognize(prepCanvas(img, { enhance: true }));
      const text = smartMarkup(cleanOcr(data.text, langs.includes("hin") || langs.includes("mar")));
      const ta = q("#t-text"); ta.value = (ta.value.trim() ? ta.value.trim() + "\n\n" : "") + text;
      if (!q("#t-title").value.trim()) q("#t-title").value = (textToSections(text)[0]?.lines[0] || "").replace(/^\(?[0-9१-९]+\s*[).।.-]\s*/, "").replace(/[,।.]+$/, "");
      st.textContent = `Read ${data.text.split("\n").filter(Boolean).length} lines — please check the words and the [Verse]/[Chorus] marks.`;
    } catch (e) { st.textContent = "Could not read the photo: " + e.message; }
  }

  async function mine() {
    markDone(); await checkDecisions().catch(() => { });
    const label = (x) => ({ queued: "not sent yet (offline)", sent: "waiting for approval",
      approved: `approved ✓ as ${esc(x.decision?.book || "a new song")} — comes with the next songbook update`,
      done: `approved ✓ — in the songbook${x.decision?.book ? " as " + esc(x.decision.book) : ""}`,
      merged: `already in the songbook — ${esc(x.decision?.book || "")} “${esc(x.decision?.title || "")}” was updated with it ✓`,
      added: `added to the service “${esc(x.decision?.service || "")}” ✓`,
      rejected: `not added${x.decision?.reason ? " — " + esc(x.decision.reason) + (x.decision.book ? " (" + esc(x.decision.book) + ")" : "") : ""}` }[x.state] || x.state);
    const list = queue.slice().reverse();
    const box = screen(`<button class="back" id="t-back">‹ Back</button><h2>My songs for the media team</h2>
      <div class="hint">Signed in as <b>${esc(pref("name", "—"))}</b> · <a href="#" id="t-who">change</a></div>
      ${list.map(x => `<div class="mine"><b>${esc(x.song.title)}</b><span class="hint">${{ new: "New song", edit: "Correction", setlist: "Set list" }[x.kind]} · ${new Date(x.at).toLocaleString()} · ${label(x)}</span>
        <div><button class="ib" data-del="${x.id}">${x.state === "queued" ? "Delete" : "Remove from list"}</button></div></div>`).join("") || `<p class="hint">Nothing yet. Tap ＋ Add to send a song.</p>`}
      <div class="bar"><button class="pbtn" id="t-retry">Send now</button></div>`);
    box.querySelector("#t-back").onclick = () => box.remove();
    box.querySelector("#t-who").onclick = (e) => { e.preventDefault(); box.remove(); setup(); };
    box.querySelector("#t-retry").onclick = async () => { await flush(); box.remove(); mine(); };
    box.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { queue = queue.filter(x => x.id !== b.dataset.del); await save(); box.remove(); mine(); });
  }
  function toastMsg(t) { const d = document.createElement("div"); d.textContent = t; d.style.cssText = "position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#111827;color:#fff;padding:10px 16px;border-radius:12px;z-index:30;font-size:14px;max-width:90vw"; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }

  const api = {
    // a song leader's list → the media desk adds it to that day's service
    async sendList(l) {
      if (!(await kv.get("team-key")) || !pref("name", "")) { setup(() => api.sendList(l)); return false; }
      const now = new Date().toISOString();
      const setlist = { id: l.id, title: l.title, date: l.date, items: l.items.map(x => ({ songId: x.songId, key: x.key || "", note: x.note || "" })) };
      const waiting = queue.find(x => x.kind === "setlist" && x.setlist?.id === l.id && (x.state === "queued" || x.state === "sent"));
      if (waiting) { Object.assign(waiting, { song: { id: "", title: `${l.title} (${l.date})` }, setlist, at: now, update: waiting.state === "sent" || waiting.update, state: "queued" }); }   // same list sent again → replace it at the desk
      else queue.push({ id: sid(), kind: "setlist", song: { id: "", title: `${l.title} (${l.date})` }, setlist, by: pref("name", ""), at: now, note: "", state: "queued" });
      await save(); await flush();
      toastMsg(queue.at(-1).state === "sent" ? "Sent to the media desk ✓" : "Saved — it will be sent when you are online");
      return true;
    },
    onLibrary: () => { markDone(); save(); },
    tools: () => `<button class="ib" id="t-fix">✎ Correct</button>`,
    bind: (song, lang) => { const b = $("t-fix"); if (b) b.onclick = () => editor({ song, lang }); },
  };
  return api;
}
