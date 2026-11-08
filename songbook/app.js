// Revival Songbook for phones (Android/iPhone, installable, works offline).
// Songs come from the church library pack in the public update repo. The pack is encrypted; it is unlocked here,
// on the phone, with the church library password. Nothing readable is ever published.
import { SongIndex, LANG_NAMES } from "./search.js";
import { chordSegments, hasChords, stripChords, sectionColor, transposeKey } from "./chords.js";
import { initLists } from "./lists.js";

const RAW = "https://raw.githubusercontent.com/capstoneen04/revival-worship-releases/main/";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const MAGIC = "RWPACK1\n";

// ---------- tiny IndexedDB key/value ----------
const dbp = new Promise((res, rej) => { const r = indexedDB.open("revival-songbook", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kv = {
  get: async (k) => { const db = await dbp; return new Promise(r => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); }); },
  set: async (k, v) => { const db = await dbp; return new Promise(r => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => r(); t.onerror = () => r(); }); },
};
const pref = (k, d) => { try { return localStorage.getItem("sb-" + k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem("sb-" + k, v); } catch { } };

// ---------- download + unlock the pack ----------
async function getJson(name) {
  for (const base of ["../", RAW]) { try { const r = await fetch(base + name, { cache: "no-cache" }); if (r.ok) return { json: await r.json(), base }; } catch { } }
  throw new Error("offline");
}
async function fetchPack() {
  const { json, base } = await getJson("latest.json");
  const lib = json.library; if (!lib?.name) throw new Error("No library in latest.json");
  const r = await fetch(base + "files/" + lib.name); if (!r.ok) throw new Error("Could not download the songs");
  const buf = new Uint8Array(await r.arrayBuffer());
  if (lib.sha256) { const h = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map(b => b.toString(16).padStart(2, "0")).join(""); if (h !== lib.sha256) throw new Error("Download was damaged — try again"); }
  return { buf, version: lib.version };
}
function splitPack(buf) {
  const head = new TextDecoder().decode(buf.slice(0, MAGIC.length)); if (head !== MAGIC) throw new Error("Not a church library file");
  const nl = buf.indexOf(10, MAGIC.length);
  return { header: JSON.parse(new TextDecoder().decode(buf.slice(MAGIC.length, nl))), body: buf.slice(nl + 1) };
}
const b64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(password, header) {
  const [, N, r, p] = (header.kdf || "scrypt-32768-8-1").split("-").map(Number);
  const pw = new TextEncoder().encode(password.normalize("NFC"));
  return new Uint8Array(await window.scrypt.scrypt(pw, b64(header.salt), N, r, p, 32));
}
async function decrypt(buf, keyBytes) {
  const { header, body } = splitPack(buf);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const data = new Uint8Array(body.length + 16); data.set(body); data.set(b64(header.tag), body.length);   // WebCrypto wants ciphertext + tag
  let plain; try { plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(header.iv) }, key, data); } catch { throw new Error("Wrong password"); }
  const json = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  const files = JSON.parse(json).files || {};
  if (!files["songs.json"]) throw new Error("No songs in this library");
  return new TextDecoder().decode(b64(files["songs.json"]));
}

// ---------- app ----------
let songs = [], pending = [], idx, cur = null, hooks = null, lang = pref("lang", ""), zoom = +pref("zoom", 1), chordsOn = pref("chords", "0") === "1", semis = 0;
document.documentElement.style.setProperty("--zoom", zoom);
const th = pref("theme", ""); if (th) document.documentElement.dataset.theme = th;
$("theme").onclick = () => { const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); const n = cur === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = n; setPref("theme", n); };

async function boot() {
  const saved = await kv.get("songs");
  if (saved) { show(saved.text, saved.version); refresh(saved.version); return; }
  $("gate").hidden = false;
  $("gf").onsubmit = async (e) => {
    e.preventDefault(); $("ge").textContent = ""; const pw = $("pw").value; if (!pw) return;
    $("gb").disabled = true; $("gb").textContent = "Downloading the songs…";
    try {
      const { buf, version } = await fetchPack();
      $("gb").textContent = "Unlocking…";
      const key = await deriveKey(pw, splitPack(buf).header);
      const text = await decrypt(buf, key);
      await kv.set("key", key); await kv.set("songs", { text, version });
      $("gate").hidden = true; show(text, version);
    } catch (err) { $("ge").textContent = err.message === "offline" ? "No internet — connect once to download the songs." : err.message; }
    $("gb").disabled = false; $("gb").textContent = "Open the songbook";
  };
}
async function refresh(have) {                       // new songs from the media team: unlock with the saved key
  try {
    const { json } = await getJson("latest.json"); const v = json.library?.version; if (!v || v === have) return;
    const key = await kv.get("key"); if (!key) return;
    const { buf, version } = await fetchPack(); const text = await decrypt(buf, key);
    await kv.set("songs", { text, version }); show(text, version, true);
  } catch { }
}

function show(text, version, updated) {
  const data = JSON.parse(text); songs = (data.songs || data).filter(s => !data.deleted?.[s.id]);
  rebuild();
  hooks?.onLibrary?.();
  $("app").hidden = false;
  $("count").textContent = `${songs.length.toLocaleString()} songs`;
  $("note").textContent = `Library ${version || ""}${updated ? " · just updated" : ""} · works offline`;
  const langs = new Set(songs.flatMap(s => Object.keys(s.versions || {})));
  $("chips").innerHTML = "";
  [["", "All"], ["hi", "हिंदी"], ["hi-Latn", "Hinglish"], ["en", "English"], ["mr", "मराठी"], ["pt", "Português"], ["es", "Español"]].filter(([k]) => !k || langs.has(k)).forEach(([k, v]) => {
    const b = document.createElement("button"); b.textContent = v; b.dataset.k = k; b.onclick = () => { lang = k; setPref("lang", k); render(); }; $("chips").appendChild(b);
  });
  render();
  if (location.hash && idx.byId.get(location.hash.slice(1))) open(location.hash.slice(1));
}
function rebuild() { idx = new SongIndex(); const ids = new Set(pending.map(p => p.song.id)); idx.build([...songs.filter(s => !ids.has(s.id)), ...pending.map(p => ({ ...p.song, _pending: p.state }))]); }
function render() {
  document.querySelectorAll("#chips button").forEach(b => b.classList.toggle("on", b.dataset.k === lang));
  const res = idx.search($("q").value, { lang, limit: 150 });
  $("list").innerHTML = res.map(({ song }) => {
    const v = song.versions[lang] || song.versions[song.lang] || Object.values(song.versions)[0];
    const b = (song.books || [])[0];
    return `<button class="song" data-id="${esc(song.id)}"><span class="n">${b ? esc(b.book + " " + b.num) : ""}</span><div class="t">${esc(v.title || song.title)}${song._pending ? ` <span class="wait">${{ sent: "waiting for approval", approved: "approved — coming soon", queued: "not sent yet" }[song._pending] || ""}</span>` : ""}</div><div class="s">${esc(stripChords(v.sections[0]?.lines[0] || ""))}</div></button>`;
  }).join("") || `<p style="color:var(--muted);padding:20px 0">No songs found.</p>`;
}
let t; $("q").oninput = () => { clearTimeout(t); t = setTimeout(render, 80); };
$("list").onclick = e => { const b = e.target.closest(".song"); if (b) { semis = 0; open(b.dataset.id); } };

function line(l) {
  if (!chordsOn || !hasChords(l)) return `<div>${esc(stripChords(l))}</div>`;
  return `<div class="cl">${chordSegments(l, semis).map(s => `<span class="cs"><b>${esc(s.chord)}</b>${esc(s.text) || " "}</span>`).join("")}</div>`;
}
function open(id, l) {
  const song = idx.byId.get(id)?.song; if (!song) return;
  const langs = Object.keys(song.versions);
  l = l || (lang && song.versions[lang] ? lang : song.lang in song.versions ? song.lang : langs[0]);
  const v = song.versions[l]; cur = { song, lang: l };
  const anyChords = v.sections.some(s => s.lines.some(hasChords));
  const key = song.key ? transposeKey(song.key, semis) : "";
  $("view").innerHTML = `<button class="back" id="back">‹ All songs</button>${lists.nav(id)}
    <h1>${esc(v.title || song.title)}</h1><div class="meta">${(song.books || []).map(b => esc(b.book + " " + b.num)).join(" · ")}${key ? " · Key " + esc(key) : ""}${song.author ? " · " + esc(song.author) : ""}</div>
    <div class="tools"><button class="ib" id="zm">A−</button><button class="ib" id="zp">A+</button>${lists.tool()}${hooks ? hooks.tools(song, l) : ""}${anyChords ? `<button class="ib" id="ch">${chordsOn ? "Hide chords" : "Chords"}</button>${chordsOn ? `<button class="ib" id="tm">−</button><button class="ib" id="tp">+</button>` : ""}` : ""}</div>
    ${langs.length > 1 ? `<div class="tabs">${langs.map(x => `<button data-l="${x}" class="${x === l ? "on" : ""}">${LANG_NAMES[x] || x}</button>`).join("")}</div>` : ""}
    ${v.sections.map(s => `<div class="sec" style="--sc:${sectionColor(s.label)}"><div class="lab">${esc(s.label)}</div>${s.lines.map(line).join("")}</div>`).join("")}`;
  document.body.classList.add("reading"); scrollTo(0, 0);
  const z = (d) => { zoom = +(getComputedStyle(document.documentElement).getPropertyValue("--zoom") || zoom); zoom = Math.min(2.2, Math.max(.8, +(zoom + d).toFixed(2))); setPref("zoom", zoom); document.documentElement.style.setProperty("--zoom", zoom); };
  $("back").onclick = () => { document.body.classList.remove("reading"); history.back(); };
  $("zm").onclick = () => z(-.1); $("zp").onclick = () => z(.1);
  if ($("ch")) $("ch").onclick = () => { chordsOn = !chordsOn; setPref("chords", chordsOn ? "1" : "0"); open(id, l); };
  if ($("tm")) { $("tm").onclick = () => { semis--; open(id, l); }; $("tp").onclick = () => { semis++; open(id, l); }; }
  hooks?.bind(song, l); lists.bind(id);
  $("view").querySelectorAll("[data-l]").forEach(b => b.onclick = () => open(id, b.dataset.l));
  if (location.hash !== "#" + id) history.pushState(null, "", "#" + id);
}
addEventListener("popstate", () => { if (!location.hash) document.body.classList.remove("reading"); else open(location.hash.slice(1)); });

const lists = initLists({ kv, esc, songs: () => songs, open: (id) => open(id), setSemis: (n) => { semis = n; }, get canSend() { return !!hooks?.sendList; }, sendList: (l) => hooks?.sendList?.(l) });
$("lists").onclick = () => lists.openLists();
$("live").onclick = () => import("./live.js").then(m => m.openLive({ kv, esc, songs: () => songs, sectionColor, stripChords }));
if (location.hash === "#live") setTimeout(() => songs.length && $("live").click(), 300);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
// team songbook (media team testers only): add songs, photo → text, corrections → song inbox
if (window.RW_TEAM) import("./team.js").then(m => { hooks = m.init({ kv, esc, $, songs: () => songs, setPending: (p) => { pending = p; if (idx) { rebuild(); render(); } }, open: (id) => open(id), refreshView: () => { if (cur) open(cur.song.id, cur.lang); } }); }).catch(e => console.error(e));
boot();
