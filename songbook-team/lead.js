// Lead live (team songbook): a song leader or the media team leads from a phone — no laptop needed (cottage meetings).
// Tap a verse → every phone's ● Live tab shows it (same encrypted relay as the media desk). While the media desk is
// sending, phones follow the desk instead.
import { liveChannel, DESK_PRIORITY_MS } from "./live.js";

let wake = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && (!wake || wake.released)) wake = await navigator.wakeLock.request("screen");
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { }
}

export async function openLead({ kv, esc, songs, search, song: first, lang: firstLang, stripChords, sectionColor, by }) {
  const ch = await liveChannel(kv); if (!ch) return;
  const box = document.createElement("div"); box.className = "live lead";
  box.innerHTML = `<div class="lv-top"><button class="back" id="ld-x">‹ Stop</button><span class="lv-dot on"></span><b>Leading live</b><span style="flex:1"></span><span class="lv-st" id="ld-st">ready</span></div>
    <div class="lv-body">
      <div class="ld-warn" id="ld-warn" hidden>The media desk is live right now — phones follow the desk. Your verses are sent but not shown until the desk has been quiet for 1½ minutes.</div>
      <input id="ld-q" type="search" placeholder="Next song — number or title" autocomplete="off"><div id="ld-res"></div>
      <div id="ld-song"></div>
    </div>
    <div class="ld-bar"><button class="pbtn" id="ld-prev">‹ Back</button><button class="pbtn" id="ld-clear">Clear</button><button class="pbtn pri" id="ld-next">Next ›</button></div>`;
  document.body.appendChild(box); document.body.classList.add("living");
  const $ = (s) => box.querySelector(s), $st = $("#ld-st");
  let song = null, lang = null, idx = -1, closed = false, es = null;

  const close = async () => {
    closed = true; es?.close(); keepAwake(false); document.removeEventListener("visibilitychange", vis);
    box.remove(); document.body.classList.remove("living");
  };
  const vis = () => { if (!closed && document.visibilityState === "visible") keepAwake(true); };
  document.addEventListener("visibilitychange", vis); keepAwake(true);
  $("#ld-x").onclick = async () => { if (confirmClear()) await send({ k: "none" }, "cleared"); close(); };
  function confirmClear() { return idx >= 0; }            // leaving while a verse is shown → clear it on the phones

  async function send(p, label) {
    $st.textContent = "sending…";
    try { await ch.send({ ...p, src: "phone", by }); $st.textContent = label ? `${label} · sent ✓` : "sent ✓"; }
    catch { $st.textContent = navigator.onLine ? "could not send — tap again" : "offline — no internet"; }
  }
  // the media desk is live? (listen on the same channel; messages without src come from the desk)
  (function listen() {
    if (closed) return;
    try {
      es = new EventSource(`${ch.url()}/sse`);
      es.onmessage = async (e) => {
        try { const m = JSON.parse(e.data); if (m.event !== "message") return; const p = await ch.decrypt(m.message); if (p.src === "phone") return; deskSeen(p.at || Date.now()); } catch { }
      };
    } catch { }
    fetch(`${ch.url()}/json?poll=1&since=2m`).then(r => r.text()).then(async t => { for (const l of t.trim().split("\n").filter(Boolean)) { try { const m = JSON.parse(l); if (m.event !== "message") continue; const p = await ch.decrypt(m.message); if (p.src !== "phone") deskSeen(p.at || Date.now()); } catch { } } }).catch(() => { });
  })();
  let deskTimer = null;
  function deskSeen(at) {
    const left = DESK_PRIORITY_MS - (Date.now() - at); if (left <= 0) return;
    $("#ld-warn").hidden = false; clearTimeout(deskTimer); deskTimer = setTimeout(() => { $("#ld-warn").hidden = true; }, left);
  }

  function load(s, l) {
    song = s; lang = l && s.versions[l] ? l : (s.versions[s.lang] ? s.lang : Object.keys(s.versions)[0]); idx = -1;
    const v = s.versions[lang], langs = Object.keys(s.versions);
    $("#ld-song").innerHTML = `<h1>${esc(v.title || s.title)}</h1><div class="meta">${(s.books || []).map(b => esc(b.book + " " + b.num)).join(" · ")}${s._pending ? " · not in the songbook yet" : ""}</div>
      ${langs.length > 1 ? `<div class="tabs">${langs.map(x => `<button data-lg="${x}" class="${x === lang ? "on" : ""}">${esc(x)}</button>`).join("")}</div>` : ""}
      <button class="ld-sec ld-title" data-i="-2"><div class="lab">Title</div>${esc(v.title || s.title)}</button>
      ${v.sections.map((x, i) => `<button class="ld-sec" data-i="${i}" style="--sc:${sectionColor(x.label)}"><div class="lab">${esc(x.label)}</div>${x.lines.map(t => `<div>${esc(stripChords(t))}</div>`).join("")}</button>`).join("")}`;
    $("#ld-song").querySelectorAll("[data-lg]").forEach(b => b.onclick = () => { const was = idx; load(song, b.dataset.lg); if (was >= 0) go(was); });
    $("#ld-song").querySelectorAll(".ld-sec").forEach(b => b.onclick = () => go(+b.dataset.i));
    $("#ld-q").value = ""; $("#ld-res").innerHTML = "";
    scrollTo(0, 0);
  }
  function go(i) {
    const v = song.versions[lang];
    let p;
    if (i === -2) p = { k: "text", t: v.title || song.title, x: [(song.books || []).map(b => b.book + " " + b.num).join(" · ")].filter(Boolean) };
    else { if (i < 0 || i >= v.sections.length) return; const s = v.sections[i]; p = { k: "song", id: song.id, t: v.title || song.title, l: s.label || "", x: s.lines.map(stripChords).slice(0, 8) }; }
    idx = i;
    box.querySelectorAll(".ld-sec").forEach(b => b.classList.toggle("cur", +b.dataset.i === i));
    box.querySelector(`.ld-sec[data-i="${i}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    send(p, i === -2 ? "title" : v.sections[i].label);
  }
  $("#ld-next").onclick = () => { if (!song) return; const n = song.versions[lang].sections.length; go(idx < 0 ? 0 : Math.min(n - 1, idx + 1)); };
  $("#ld-prev").onclick = () => { if (!song || idx <= 0) return; go(idx - 1); };
  $("#ld-clear").onclick = () => { idx = -1; box.querySelectorAll(".ld-sec").forEach(b => b.classList.remove("cur")); send({ k: "none" }, "screen cleared"); };
  let t; $("#ld-q").oninput = () => { clearTimeout(t); t = setTimeout(() => {
    const q = $("#ld-q").value.trim(); if (!q) { $("#ld-res").innerHTML = ""; return; }
    const res = search(q).slice(0, 6);
    $("#ld-res").innerHTML = res.map(({ song: s }) => `<button class="song" data-id="${esc(s.id)}"><span class="n">${(s.books || [])[0] ? esc(s.books[0].book + " " + s.books[0].num) : ""}</span><div class="t">${esc(s.title)}</div></button>`).join("") || `<p class="muted">No songs found.</p>`;
    $("#ld-res").querySelectorAll(".song").forEach(b => b.onclick = () => { const s = res.find(r => r.song.id === b.dataset.id)?.song; if (s) load(s); });
  }, 100); };
  if (first) load(first, firstLang);
  return { close };
}
