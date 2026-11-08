// Live tab: follow the song / Bible verse that the media desk is projecting.
// The desk sends it (locked with the church library key) through the ntfy.sh relay; this phone unlocks it with the same key.
const RELAY = () => { try { return localStorage.getItem("sb-relay") || "https://ntfy.sh"; } catch { return "https://ntfy.sh"; } };
const hex = (b) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const cat = (a, s) => { const t = new TextEncoder().encode(s), o = new Uint8Array(a.length + t.length); o.set(a); o.set(t, a.length); return o; };

export async function openLive({ kv, esc, songs, sectionColor, stripChords }) {
  const keyBytes = await kv.get("key"); if (!keyBytes) return;
  const k = new Uint8Array(keyBytes);
  const topic = "rw-" + hex(await crypto.subtle.digest("SHA-256", cat(k, "|rw-live-topic"))).slice(0, 32);
  const aes = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", cat(k, "|rw-live-enc")), "AES-GCM", false, ["decrypt"]);
  const byId = new Map(songs().map(s => [s.id, s]));

  const box = document.createElement("div"); box.className = "live";
  box.innerHTML = `<div class="lv-top"><button class="back" id="lv-back">‹ Songs</button><span class="lv-dot" id="lv-dot"></span><b>Live</b><span style="flex:1"></span><span class="lv-st" id="lv-st">connecting…</span><button class="ib" id="lv-zm" title="Smaller text">A−</button><button class="ib" id="lv-zp" title="Bigger text">A+</button></div><div class="lv-body" id="lv-body"><p class="muted">Waiting for the media desk… When a song or Bible verse is on the projector it shows here.</p><p class="muted lv-wifi">At church you can also scan the QR code from the media desk (church Wi-Fi).</p></div>`;
  document.body.appendChild(box); document.body.classList.add("living");
  const $b = box.querySelector("#lv-body"), $st = box.querySelector("#lv-st"), $dot = box.querySelector("#lv-dot");
  let es = null, shownSong = null, closed = false;
  const close = () => { closed = true; es?.close(); box.remove(); document.body.classList.remove("living"); };
  box.querySelector("#lv-back").onclick = close;
  // text size: each person's own choice, remembered on this phone (same setting as the song pages)
  const zoomBy = (d) => { let z = +(getComputedStyle(document.documentElement).getPropertyValue("--zoom") || 1); z = Math.min(2.2, Math.max(.8, +(z + d).toFixed(2))); document.documentElement.style.setProperty("--zoom", z); try { localStorage.setItem("sb-zoom", z); } catch { } };
  box.querySelector("#lv-zm").onclick = () => zoomBy(-.1); box.querySelector("#lv-zp").onclick = () => zoomBy(.1);

  async function decrypt(b64) {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, aes, raw.slice(12));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? "now" : s < 3600 ? `${Math.round(s / 60)} min ago` : "earlier"; };
  const base = (l) => String(l || "").replace(/\s+[a-z]$/, "").trim().toLowerCase();
  function show(p) {
    $st.textContent = "live · " + ago(p.at || Date.now());
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
  async function handle(msg) { try { show(await decrypt(msg)); } catch { /* not ours / older key */ } }

  // last message first (if the desk sent something in the last 3 hours), then live updates
  try {
    const r = await fetch(`${RELAY()}/${topic}/json?poll=1&since=3h`);
    const lines = (await r.text()).trim().split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(m => m?.event === "message");
    if (lines.length) await handle(lines.at(-1).message);
  } catch { }
  function connect() {
    if (closed) return;
    es = new EventSource(`${RELAY()}/${topic}/sse`);
    es.onopen = () => { $dot.classList.add("on"); if (/connecting|offline/.test($st.textContent)) $st.textContent = "connected"; };
    es.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.event === "message") handle(m.message); } catch { } };
    es.onerror = () => { $dot.classList.remove("on"); $st.textContent = navigator.onLine ? "reconnecting…" : "offline"; };
  }
  connect();
}
