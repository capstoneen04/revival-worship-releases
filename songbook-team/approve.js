// Approve on the phone (team songbook, approvers only): the same Inbox the media desk has — duplicate check, number,
// review/edit, approve — and Publish: the church library is re-locked on this phone and uploaded to the public update
// repo, so every computer and phone gets the song without the laptop. Needs the desk key (inbox + releases repos).
const MAGIC = "RWPACK1\n";
const enc = (s) => encodeURIComponent(s).replace(/%2F/g, "/");
const u8b64 = (u8) => { let bin = ""; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(bin); };
const b64u8 = (s) => Uint8Array.from(atob(s.replace(/\s/g, "")), c => c.charCodeAt(0));
const strB64 = (str) => u8b64(new TextEncoder().encode(str));
const b64Str = (b) => new TextDecoder().decode(b64u8(b));
const p2 = (n) => String(n).padStart(2, "0");
const verStr = (d = new Date()) => `${d.getFullYear() % 100}.${p2(d.getMonth() + 1)}${p2(d.getDate())}.${p2(d.getHours())}${p2(d.getMinutes())}`;
const cmpV = (a, b) => { const x = String(a || 0).split(".").map(Number), y = String(b || 0).split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const bookOf = (s) => (s?.books || []).map(b => b.book + " " + b.num).join(", ");
const ago = (iso) => { const d = (Date.now() - new Date(iso)) / 60000; return d < 60 ? `${Math.max(1, Math.round(d))} min ago` : d < 1440 ? `${Math.round(d / 60)} h ago` : new Date(iso).toLocaleDateString(); };

// ---- is this song already in the songbook? (same check as the media desk: 3-letter pieces of the words) ----
const clean = (t) => (t || "").replace(/\[[^\]]*\]/g, " ").replace(/\(x\d+\)|\.{2,}\s*\d/g, " ").replace(/^\s*[\d१-९]+[.)]?\s+/gm, "").replace(/[^\p{L}\p{M}]+/gu, "").toLowerCase();
const grams = (t) => { const c = clean(t), g = new Set(); for (let i = 0; i + 3 <= c.length; i++) g.add(c.slice(i, i + 3)); return g; };
const songWords = (s) => Object.values(s.versions || {}).filter(v => !v.auto).map(v => [v.title, ...(v.sections || []).flatMap(x => x.lines)].join("\n")).join("\n");
let gi = null, giFor = null;
export function findMatches(all, song, limit = 2) {
  if (giFor !== all) { gi = all.map(s => ({ s, g: grams(songWords(s)) })); giFor = all; }
  const q = grams(songWords(song)); if (q.size < 12) return [];
  const out = [];
  for (const x of gi) { if (x.s.id === song.id) continue; let n = 0; for (const t of q) if (x.g.has(t)) n++; const score = n / q.size; if (score >= 0.55) out.push({ song: x.s, score }); }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
export const nextFree = (all, book) => { let max = 0; for (const s of all) for (const b of s.books || []) if (b.book === book && b.num > max) max = b.num; return { book, num: max + 1 }; };

// ---- the locked church library on the phone (same format as the desktop: RWPACK1 + header + AES-256-GCM(gzip(json))) ----
async function openPack(buf, keyBytes) {
  if (new TextDecoder().decode(buf.slice(0, MAGIC.length)) !== MAGIC) throw new Error("Not a church library file");
  const nl = buf.indexOf(10, MAGIC.length), header = JSON.parse(new TextDecoder().decode(buf.slice(MAGIC.length, nl))), body = buf.slice(nl + 1);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const data = new Uint8Array(body.length + 16); data.set(body); data.set(b64u8(header.tag), body.length);
  let plain; try { plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u8(header.iv) }, key, data); }
  catch { throw new Error("This phone's songbook password is out of date — open the songbook once to enter the new password."); }
  const json = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return { header, data: JSON.parse(json) };
}
async function lockPack(files, keyBytes, salt, version) {
  const json = JSON.stringify({ version, created: new Date().toISOString(), files });
  const gz = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, gz));
  const ct = out.slice(0, out.length - 16), tag = out.slice(out.length - 16);
  const header = { version, salt, iv: u8b64(iv), tag: u8b64(tag), kdf: "scrypt-32768-8-1", files: Object.keys(files).length };
  const head = new TextEncoder().encode(MAGIC + JSON.stringify(header) + "\n");
  const buf = new Uint8Array(head.length + ct.length); buf.set(head); buf.set(ct, head.length);
  return buf;
}
const hexSha = async (buf) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map(b => b.toString(16).padStart(2, "0")).join("");

export function initApprove(ctx) {
  const { kv, esc, app, screen, toastMsg, editor, pref, API, INBOX } = ctx;
  const RELEASES = () => pref("releases", "capstoneen04/revival-worship-releases");
  async function gh(method, url, body, { raw = false, ok404 = false } = {}) {
    const key = await kv.get("team-key");
    const r = await fetch(API() + url, { method, cache: "no-store", headers: { authorization: "Bearer " + key, accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (ok404 && r.status === 404) return null;
    if (r.status === 401) throw new Error("The key is not valid (expired or mistyped).");
    if (r.status === 403 || r.status === 404) throw new Error(`This key has no write access to ${url.split("/").slice(2, 4).join("/")} — approving needs the desk key (song inbox + releases, Contents: Read and write).`);
    if (r.status === 409 || r.status === 422) throw new Error("Someone published at the same moment — try again.");
    if (!r.ok) throw new Error("GitHub error " + r.status);
    return raw ? new Uint8Array(await r.arrayBuffer()) : r.status === 204 ? null : r.json();
  }

  // ---------- publish: merge the approved song(s) into the newest published library, lock it here, upload it ----------
  async function publish(add, step = () => { }) {
    const keyBytes = await kv.get("key"); if (!keyBytes) throw new Error("Open the songbook once first.");
    const K = new Uint8Array(keyBytes), R = RELEASES();
    step("Reading the published library…");
    const manFile = await gh("GET", `/repos/${R}/contents/latest.json`);
    const man = JSON.parse(b64Str(manFile.content));
    if (!man.library?.name) throw new Error("No library in latest.json");
    const packBuf = await gh("GET", `/repos/${R}/contents/files/${enc(man.library.name)}`, null, { raw: true });
    const { header, data } = await openPack(packBuf, K);
    const files = data.files; const doc = JSON.parse(b64Str(files["songs.json"]));
    const byId = new Map((doc.songs || []).map(s => [s.id, s]));
    const saved = [];
    for (const s0 of add) {
      const s = JSON.parse(JSON.stringify(s0)); delete s._pending; delete s._score;
      if (s._autoBook) { const b = nextFree([...byId.values()], s._autoBook); s.books = [b]; }      // number decided against the newest library
      delete s._autoBook;
      s.updated = new Date().toISOString(); s.status = s.status === "review" ? "ok" : (s.status || "ok");
      if (doc.deleted?.[s.id]) delete doc.deleted[s.id];
      byId.set(s.id, s); saved.push(s);
    }
    doc.songs = [...byId.values()]; doc.version = Date.now(); doc.generated = new Date().toISOString(); doc.publishedBy = pref("name", "") + " (phone)";
    const text = JSON.stringify(doc);
    files["songs.json"] = strB64(text);
    let v = verStr(); if (cmpV(v, man.library.version) <= 0) { const p = String(man.library.version).split("."); p[p.length - 1] = String(+p[p.length - 1] + 1).padStart(4, "0"); v = p.join("."); }
    step("Locking the library…");
    const buf = await lockPack(files, K, header.salt, v);
    const name = `church-library-${v}.rwpack`;
    const lib = { name, size: buf.length, sha256: await hexSha(buf), version: v };
    step("Uploading…");
    const ref = await gh("GET", `/repos/${R}/git/ref/heads/main`), parent = ref.object.sha;
    const base = await gh("GET", `/repos/${R}/git/commits/${parent}`);
    const fresh = JSON.parse(b64Str((await gh("GET", `/repos/${R}/contents/latest.json?ref=${parent}`)).content));   // keep anything changed meanwhile (e.g. a new app version)
    const oldName = fresh.library?.name; fresh.library = lib;
    const blobPack = await gh("POST", `/repos/${R}/git/blobs`, { content: u8b64(buf), encoding: "base64" });
    const blobMan = await gh("POST", `/repos/${R}/git/blobs`, { content: strB64(JSON.stringify(fresh, null, 1)), encoding: "base64" });
    const tree = [{ path: `files/${name}`, mode: "100644", type: "blob", sha: blobPack.sha }, { path: "latest.json", mode: "100644", type: "blob", sha: blobMan.sha }];
    if (oldName && oldName !== name) tree.push({ path: `files/${oldName}`, mode: "100644", type: "blob", sha: null });
    const t = await gh("POST", `/repos/${R}/git/trees`, { base_tree: base.tree.sha, tree });
    const c = await gh("POST", `/repos/${R}/git/commits`, { message: `Church library ${v}: ${saved.map(s => `${bookOf(s)} ${s.title}`).join(", ")} (${pref("name", "phone")}, phone)`, tree: t.sha, parents: [parent] });
    await gh("PATCH", `/repos/${R}/git/refs/heads/main`, { sha: c.sha });
    step("Installing on this phone…");
    await app.install(text, v);
    return { version: v, saved, total: doc.songs.length };
  }

  // ---------- the inbox ----------
  async function load() {
    const list = await gh("GET", `/repos/${INBOX()}/contents/inbox`, null, { ok404: true }) || [];
    const items = [];
    for (const f of list.filter(f => f.type === "file" && f.name.endsWith(".json"))) {
      try { const raw = await gh("GET", `/repos/${INBOX()}/contents/${enc(f.path)}`, null, { raw: true }); items.push({ name: f.name, path: f.path, sha: f.sha, ...JSON.parse(new TextDecoder().decode(raw)) }); } catch { }
    }
    const groups = new Map();                  // one card per song (a song sent several times → newest wins, older go with it)
    for (const it of items.sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
      const k = it.kind === "setlist" ? "list:" + (it.setlist?.id || it.name) : "song:" + (it.song?.id || it.name);
      const g = groups.get(k); if (!g) groups.set(k, { latest: it, older: [] }); else { g.older.push(g.latest); g.latest = it; }
    }
    return [...groups.values()];
  }
  async function resolve(g, state, decision) {   // tell the sender's phone, then clear the submission(s) from the inbox
    for (const x of [g.latest, ...g.older]) {
      const dp = "decisions/" + x.name; const old = await gh("GET", `/repos/${INBOX()}/contents/${dp}`, null, { ok404: true });
      await gh("PUT", `/repos/${INBOX()}/contents/${dp}`, { message: `Decision: ${state} (phone)`, content: strB64(JSON.stringify({ ...decision, state, at: new Date().toISOString(), by: pref("name", "") })), ...(old ? { sha: old.sha } : {}) });
      await gh("DELETE", `/repos/${INBOX()}/contents/${enc(x.path)}`, { message: `Song ${state} (phone)`, sha: x.sha });
    }
  }
  function progress() {
    const d = screen(`<h2>Publishing…</h2><p class="hint" id="pg">Starting…</p>`);
    return { step: (t) => { d.querySelector("#pg").textContent = t; }, done: () => d.remove() };
  }
  const preview = (song) => { const v = song?.versions?.[song.lang] || Object.values(song?.versions || {})[0]; return (v?.sections || []).slice(0, 2).map(s => `[${s.label}]\n` + s.lines.slice(0, 4).map(app.stripChords).join("\n")).join("\n\n"); };

  async function openInbox() {
    const box = screen(`<button class="back" id="i-back">‹ Back</button><h2>Song inbox</h2><div class="hint" id="i-st">Loading songs from the team phones…</div><div id="i-list"></div>`);
    box.querySelector("#i-back").onclick = () => box.remove();
    let groups; try { groups = await load(); } catch (e) { box.querySelector("#i-st").textContent = e.message; return; }
    const all = app.songs(), book = pref("newbook", "RH");
    box.querySelector("#i-st").innerHTML = groups.length ? `Approving here publishes the songbook to everyone straight away.` : `Nothing waiting. Songs from the team phones appear here.`;
    const L = box.querySelector("#i-list");
    for (const g of groups) {
      const it = g.latest, by = esc(it.by || "the team");
      const card = document.createElement("div"); card.className = "mine";
      if (it.kind === "setlist") {
        card.innerHTML = `<b>${esc(it.setlist?.title || "Set list")} — ${esc(it.setlist?.date || "")}</b><span class="hint">Set list · ${by} · ${ago(it.at)} · ${it.setlist?.items?.length || 0} songs. Set lists are added to a service on the laptop (Songs → Inbox); it stays here for the desk.</span>`;
        L.appendChild(card); continue;
      }
      const song = it.song || {}, exists = all.find(s => s.id === song.id);
      const matches = exists ? [] : findMatches(all, song), dup = matches[0]?.song;
      const check = exists ? `<span class="hint">Correction to ${esc(bookOf(exists))} “${esc(exists.title)}” — the number stays.</span>`
        : dup ? matches.map(m => `<span class="hint" style="color:#d97706">⚠ ${Math.round(m.score * 100)}% the same as ${esc(bookOf(m.song))} “${esc(m.song.title)}” — already in the songbook.</span>`).join("")
        : `<span class="hint" style="color:#16a34a">✓ Checked all ${all.length.toLocaleString()} songs — new. It will get ${book} ${nextFree(all, book).num}.</span>`;
      card.innerHTML = `<b>${esc(song.title || "Untitled")}</b><span class="hint">${exists ? "Correction" : "New song"} · ${by} · ${ago(it.at)}${g.older.length ? ` · sent ${g.older.length + 1} times (newest shown)` : ""}</span>
        ${it.note ? `<span class="hint">Note: ${esc(it.note)}</span>` : ""}${check}
        <pre style="white-space:pre-wrap;font:inherit;font-size:13px;margin:6px 0;max-height:160px;overflow:auto;background:var(--card);border:1px solid var(--line);padding:8px;border-radius:8px">${esc(preview(song))}</pre>
        <div class="row">${dup ? `<button class="pbtn pri" data-a="cmp">Compare with ${esc(bookOf(dup))}</button>` : `<button class="pbtn pri" data-a="rev">Review</button>`}<button class="pbtn" data-a="rej">${dup ? "Discard" : "Reject"}</button></div>`;
      L.appendChild(card);
      const review = (target, state) => {
        // the draft opens in the editor (not saved yet); Approve & publish → in the songbook for everyone; Back → it stays in the inbox
        let draft;
        if (target) { draft = JSON.parse(JSON.stringify(target)); for (const [l, v] of Object.entries(song.versions || {})) { if (v.auto && draft.versions[l] && !draft.versions[l].auto) continue; draft.versions[l] = { ...v }; } if (song.key && !draft.key) draft.key = song.key; }
        else { draft = JSON.parse(JSON.stringify(song)); draft.books = []; draft.source = song.source || "team:" + (it.by || ""); }
        editor({ song: draft, lang: draft.lang in draft.versions ? draft.lang : Object.keys(draft.versions)[0], approve: { by: it.by || "the team", isNew: !target, nextNum: target ? null : `${book} ${nextFree(all, book).num}`,
          go: async (out) => {
            if (!target && !(out.books || []).length) out._autoBook = book;
            const pg = progress();
            try {
              const r = await publish([out], pg.step);
              const s = r.saved[0]; pg.step("Telling the sender…");
              await resolve(g, state, { songId: s.id, book: bookOf(s), title: s.title });
              pg.done(); box.remove(); toastMsg(`${bookOf(s)} “${s.title}” is in everyone's songbook ✓`); app.open(s.id);
              return true;
            } catch (e) { pg.done(); toastMsg(e.message); return false; }
          } } });
      };
      const btn = (a) => card.querySelector(`[data-a="${a}"]`);
      if (btn("rev")) btn("rev").onclick = () => review(exists || null, "approved");
      if (btn("cmp")) btn("cmp").onclick = () => compare(dup);
      btn("rej").onclick = async () => {
        if (!confirm(dup ? `Discard it and keep ${bookOf(dup)}?` : `Reject “${song.title}”?`)) return;
        try { await resolve(g, "rejected", dup ? { songId: dup.id, book: bookOf(dup), title: dup.title, reason: "already in the songbook" } : {}); card.remove(); toastMsg("Removed from the inbox"); } catch (e) { toastMsg(e.message); }
      };
      function compare(old) {
        const col = (head, sg) => `<div style="flex:1;min-width:0"><b style="font-size:13px">${esc(head)}</b><pre style="white-space:pre-wrap;font:inherit;font-size:13px;margin:4px 0;max-height:46vh;overflow:auto;background:var(--card);border:1px solid var(--line);padding:8px;border-radius:8px">${esc(preview({ ...sg, versions: sg.versions }))}</pre></div>`;
        const d = screen(`<button class="back" id="c-back">‹ Back</button><h2>${esc(bookOf(old))} “${esc(old.title)}”</h2>
          <div class="row" style="align-items:flex-start">${col("In the songbook", old)}${col("Sent by " + (it.by || "the team"), song)}</div>
          <div class="bar" style="flex-direction:column"><button class="pbtn" data-c="keep">Keep ${esc(bookOf(old))} as it is</button><button class="pbtn" data-c="diff">It's a different song — review</button><button class="pbtn pri" data-c="merge">Review ${esc(bookOf(old))} with the sent words</button></div>`);
        d.querySelector("#c-back").onclick = () => d.remove();
        d.querySelector('[data-c="keep"]').onclick = () => { d.remove(); btn("rej").click(); };
        d.querySelector('[data-c="diff"]').onclick = () => { d.remove(); review(null, "approved"); };
        d.querySelector('[data-c="merge"]').onclick = () => { d.remove(); review(old, "merged"); };
      }
    }
  }
  return { openInbox, publish };
}
