// Live tab: follow the song / Bible verse that the media desk is projecting.
// The desk sends it (locked with the church library key) through the ntfy.sh relay; this phone unlocks it with the same key.
const RELAY = () => { try { return localStorage.getItem("sb-relay") || "https://ntfy.sh"; } catch { return "https://ntfy.sh"; } };
const hex = (b) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const cat = (a, s) => { const t = new TextEncoder().encode(s), o = new Uint8Array(a.length + t.length); o.set(a); o.set(t, a.length); return o; };

// the live channel: topic + AES key made from the church library key (same as the media desk); also used by Lead live
export async function liveChannel(kv) {
  const keyBytes = await kv.get("key"); if (!keyBytes) return null;
  const k = new Uint8Array(keyBytes);
  const topic = "rw-" + hex(await crypto.subtle.digest("SHA-256", cat(k, "|rw-live-topic"))).slice(0, 32);
  const aes = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", cat(k, "|rw-live-enc")), "AES-GCM", false, ["encrypt", "decrypt"]);
  const url = () => `${RELAY()}/${topic}`;
  return {
    url,
    async decrypt(b64) {
      const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, aes, raw.slice(12));
      return JSON.parse(new TextDecoder().decode(plain));
    },
    async send(payload) {                         // same size rule as the desk: relay messages stay under 4 KB
      let p = { ...payload, at: Date.now() };
      const size = () => new TextEncoder().encode(JSON.stringify(p)).length;
      if (size() > 2700) p = { ...p, x2: [] };
      for (let n = 0; n < 20 && size() > 2700 && p.x?.length; n++) p = { ...p, x: p.x.length > 1 ? p.x.slice(0, -1) : [p.x[0].slice(0, 300)] };
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(JSON.stringify(p))));
      const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
      let bin = ""; for (const b of all) bin += String.fromCharCode(b);
      const r = await fetch(url(), { method: "POST", body: btoa(bin) });
      if (!r.ok) throw new Error("relay " + r.status);
      return p;
    },
  };
}
export const DESK_PRIORITY_MS = 90000;           // while the media desk is sending, phones follow the desk (a phone leader is ignored)

export async function openLive({ kv, esc, songs, sectionColor, stripChords }) {
  const ch = await liveChannel(kv); if (!ch) return;
  const byId = new Map(songs().map(s => [s.id, s]));

  const box = document.createElement("div"); box.className = "live";
  box.innerHTML = `<div class="lv-top"><button class="back" id="lv-back">‹ Songs</button><span class="lv-dot" id="lv-dot"></span><b>Live</b><span style="flex:1"></span><span class="lv-st" id="lv-st">connecting…</span><button class="ib" id="lv-zm" title="Smaller text">A−</button><button class="ib" id="lv-zp" title="Bigger text">A+</button></div><div class="lv-body" id="lv-body"><p class="muted">Waiting… When the media desk projects a song or Bible verse — or a song leader leads from the team songbook — it shows here.</p><p class="muted lv-wifi">At church you can also scan the QR code from the media desk (church Wi-Fi).</p></div>`;
  document.body.appendChild(box); document.body.classList.add("living");
  const $b = box.querySelector("#lv-body"), $st = box.querySelector("#lv-st"), $dot = box.querySelector("#lv-dot");
  let es = null, shownSong = null, closed = false;
  const close = () => { closed = true; es?.close(); box.remove(); document.body.classList.remove("living"); };
  box.querySelector("#lv-back").onclick = close;
  // text size: each person's own choice, remembered on this phone (same setting as the song pages)
  const zoomBy = (d) => { let z = +(getComputedStyle(document.documentElement).getPropertyValue("--zoom") || 1); z = Math.min(2.2, Math.max(.8, +(z + d).toFixed(2))); document.documentElement.style.setProperty("--zoom", z); try { localStorage.setItem("sb-zoom", z); } catch { } };
  box.querySelector("#lv-zm").onclick = () => zoomBy(-.1); box.querySelector("#lv-zp").onclick = () => zoomBy(.1);

  let deskAt = 0;                                 // when the media desk last sent something
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? "now" : s < 3600 ? `${Math.round(s / 60)} min ago` : "earlier"; };
  const base = (l) => String(l || "").replace(/\s+[a-z]$/, "").trim().toLowerCase();
  function show(p) {
    $st.textContent = "live · " + ago(p.at || Date.now()) + (p.src === "phone" && p.by ? " · " + p.by : "");
    if (p.k === "none") { $b.innerHTML = `<p class="muted">Nothing on the screen right now.</p>`; shownSong = null; return; }
    if (p.k === "song" && byId.get(p.id)) {
      const song = byId.get(p.id); const v = song.versions[song.lang] || Object.values(song.versions)[0];
      if (shownSong !== p.id) {
        $b.innerHTML = `<h1>${esc(v.title || song.title)}</h1><div class="meta">${(song.books || []).map(b => esc(b.book + " " + b.num)).join(" · ")}</div>` +
          v.sections.map((s, i) => `<div class="lv-sec" data-l="${esc(base(s.label))}" style="--sc:${sectionColor(s.label)}"><div class="lab">${esc(s.label)}</div>${s.lines.map(l => `<div>${esc(stripChords(l))}</div>`).join("")}</div>`).join("");
        shownSong = p.id;
      }
      const want = base(p.l); let hit = null;
      $b.querySelectorAll(".lv-sec").forEach(e => { const on = !hit && e.dataset.l === want; e.classList.toggle("cur", on); if (on) hit = e; });
      if (hit) hit.scrollIntoView({ block: "center", behavior: "smooth" });
      else { $b.querySelector(".lv-now")?.remove(); $b.insertAdjacentHTML("afterbegin", `<div class="lv-sec cur lv-now">${p.x.map(l => `<div>${esc(stripChords(l))}</div>`).join("")}</div>`); }
      return;
    }
    shownSong = null;            // Bible verse, a song not in this phone's songbook, or other words on screen
    $b.innerHTML = `<h1>${esc(p.t || "")}</h1><div class="lv-sec cur">${(p.x || []).map(l => `<div>${esc(stripChords(l))}</div>`).join("")}${(p.x2 || []).filter(Boolean).map(l => `<div class="l2">${esc(stripChords(l))}</div>`).join("")}</div>`;
  }
  // returns the message if it should be shown: the desk wins while it is active; a phone leader is used otherwise (cottage meetings)
  async function accept(msg) {
    let p; try { p = await ch.decrypt(msg); } catch { return null; }   // not ours / older key
    if (p.src === "phone") { if ((p.at || Date.now()) - deskAt < DESK_PRIORITY_MS) return null; }
    else deskAt = p.at || Date.now();
    return p;
  }
  async function handle(msg) { const p = await accept(msg); if (p) show(p); }

  // last message first (if the desk sent something in the last 3 hours), then live updates
  try {
    const r = await fetch(`${ch.url()}/json?poll=1&since=3h`);
    const lines = (await r.text()).trim().split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(m => m?.event === "message");
    let last = null; for (const m of lines) { const p = await accept(m.message); if (p) last = p; }
    if (last) show(last);
  } catch { }
  function connect() {
    if (closed) return;
    es = new EventSource(`${ch.url()}/sse`);
    es.onopen = () => { $dot.classList.add("on"); if (/connecting|offline/.test($st.textContent)) $st.textContent = "connected"; };
    es.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.event === "message") handle(m.message); } catch { } };
    es.onerror = () => { $dot.classList.remove("on"); $st.textContent = navigator.onLine ? "reconnecting…" : "offline"; };
  }
  connect();
}
