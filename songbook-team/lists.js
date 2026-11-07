// My lists: a song leader's set list for a service (date, songs in order, key, note).
// Kept on this phone (works offline). Share as text (WhatsApp), and in the team songbook send it to the media desk,
// where it is added to that day's service.
const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const note = (k) => { const m = String(k || "").trim().match(/^([A-G](?:#|b)?)/); if (!m) return -1; const i = SHARP.indexOf(m[1]); return i >= 0 ? i : FLAT.indexOf(m[1]); };
export const semisBetween = (from, to) => { const a = note(from), b = note(to); if (a < 0 || b < 0) return 0; let d = (b - a + 12) % 12; if (d > 6) d -= 12; return d; };
const sid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
const nice = (iso) => { try { return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); } catch { return iso; } };

export function initLists(app) {
  const { kv, esc } = app;
  let lists = [], ctx = null;                 // ctx = { listId, index } while singing through a list
  const load = async () => { lists = (await kv.get("lists")) || []; };
  const save = async () => { await kv.set("lists", lists); };
  const loaded = load();
  const css = document.createElement("style");
  css.textContent = `.ls{position:fixed;inset:0;z-index:16;background:var(--bg);overflow:auto;padding:calc(12px + env(safe-area-inset-top)) 16px 60px}
  .ls .in{max-width:720px;margin:0 auto} .ls h2{margin:6px 0 10px;font-size:20px} .ls .row{display:flex;gap:8px;align-items:center}
  .ls input{height:40px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:0 10px;font:inherit;font-size:15px}
  .ls .li{display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--line);padding:10px 0} .ls .li .t{flex:1;min-width:0}
  .ls .li .t b{display:block;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .ls .li .t span{color:var(--muted);font-size:12.5px}
  .ls .li .n{color:var(--muted);font-size:12px;width:52px} .ls .k{width:54px;text-align:center;padding:0 4px}
  .ls .sm{height:32px;min-width:32px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit;font-size:13px}
  .ls .bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px} .ls .bar button{flex:1;min-width:140px}
  .ls .muted{color:var(--muted);font-size:13.5px;line-height:1.5}
  .pbtn{height:44px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit;font-size:15px} .pbtn.pri{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
  .lnav{display:flex;gap:8px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px 8px;margin:6px 0 4px;font-size:13.5px}
  .lnav b{flex:1;text-align:center;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pick{position:fixed;left:0;right:0;bottom:0;z-index:25;background:var(--card);border-top:1px solid var(--line);border-radius:16px 16px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.2)}
  .pick button.o{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;color:var(--ink);padding:12px 2px;font:inherit;font-size:15px}`;
  document.head.appendChild(css);
  const song = (id) => app.songs().find(s => s.id === id);
  const num = (s) => s ? (s.books || []).map(b => b.book + " " + b.num).join(" · ") : "";
  const titleOf = (s) => s ? (s.versions[s.lang]?.title || s.title) : "(song not in this songbook)";
  const toast = (t) => { const d = document.createElement("div"); d.textContent = t; d.style.cssText = "position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#111827;color:#fff;padding:10px 16px;border-radius:12px;z-index:30;font-size:14px;max-width:90vw"; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); };
  function screen(html) { document.querySelectorAll(".ls").forEach(x => x.remove()); const d = document.createElement("div"); d.className = "ls"; d.innerHTML = `<div class="in">${html}</div>`; document.body.appendChild(d); return d; }

  // ---------- all lists ----------
  async function openLists() {
    await loaded;
    const box = screen(`<button class="back" id="ls-x">‹ Songs</button><h2>My lists</h2>
      <p class="muted">Plan the songs for a service: add songs with “＋ List” on any song, set the key, put them in order.${app.canSend ? " Send it to the media desk and it goes into that day's service." : ""}</p>
      ${lists.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(l => `<div class="li" data-id="${l.id}"><div class="t"><b>${esc(l.title)}</b><span>${esc(nice(l.date))} · ${l.items.length} song${l.items.length === 1 ? "" : "s"}${l.sent ? " · sent ✓" : ""}</span></div><span>›</span></div>`).join("") || `<p class="muted">No lists yet.</p>`}
      <div class="bar"><button class="pbtn pri" id="ls-new">＋ New list</button></div>`);
    box.querySelector("#ls-x").onclick = () => box.remove();
    box.querySelector("#ls-new").onclick = async () => { const l = newList(); await save(); openList(l.id); };
    box.querySelectorAll(".li[data-id]").forEach(e => e.onclick = () => openList(e.dataset.id));
  }
  function newList() { const l = { id: sid(), title: "Sunday worship", date: nextSunday(), items: [], updated: new Date().toISOString() }; lists.push(l); return l; }

  // ---------- one list ----------
  async function openList(id) {
    await loaded; const l = lists.find(x => x.id === id); if (!l) return openLists();
    const box = screen(`<button class="back" id="ls-b">‹ My lists</button>
      <div class="row" style="margin:6px 0 4px"><input id="ls-t" value="${esc(l.title)}" style="flex:1"><input id="ls-d" type="date" value="${esc(l.date)}" style="width:150px"></div>
      ${l.items.map((it, i) => { const s = song(it.songId); return `<div class="li"><span class="n">${i + 1}. ${esc(num(s))}</span><div class="t" data-i="${i}"><b>${esc(titleOf(s))}</b><span>${s?.key ? "song key " + esc(s.key) : "&nbsp;"}</span></div>
        <input class="k" data-k="${i}" value="${esc(it.key || "")}" placeholder="Key"><button class="sm" data-up="${i}" ${i ? "" : "disabled"}>↑</button><button class="sm" data-dn="${i}" ${i < l.items.length - 1 ? "" : "disabled"}>↓</button><button class="sm" data-rm="${i}">✕</button></div>`; }).join("") || `<p class="muted">Empty — open a song and tap “＋ List”.</p>`}
      <div class="bar">${l.items.length ? `<button class="pbtn pri" id="ls-go">▶ Sing through</button>` : ""}<button class="pbtn" id="ls-share">Share as text</button>${app.canSend ? `<button class="pbtn" id="ls-send">Send to media desk${l.sent ? " again" : ""}</button>` : ""}</div>
      <div class="bar"><button class="pbtn" id="ls-del" style="color:#e5484d">Delete list</button></div>`);
    const q = (s) => box.querySelector(s);
    const touch = async () => { l.updated = new Date().toISOString(); await save(); };
    q("#ls-b").onclick = () => openLists();
    q("#ls-t").onchange = async () => { l.title = q("#ls-t").value.trim() || "Set list"; await touch(); };
    q("#ls-d").onchange = async () => { l.date = q("#ls-d").value || l.date; await touch(); };
    box.querySelectorAll("[data-k]").forEach(e => e.onchange = async () => { l.items[+e.dataset.k].key = e.value.trim(); await touch(); });
    box.querySelectorAll("[data-up]").forEach(e => e.onclick = async () => { const i = +e.dataset.up; [l.items[i - 1], l.items[i]] = [l.items[i], l.items[i - 1]]; await touch(); openList(id); });
    box.querySelectorAll("[data-dn]").forEach(e => e.onclick = async () => { const i = +e.dataset.dn; [l.items[i + 1], l.items[i]] = [l.items[i], l.items[i + 1]]; await touch(); openList(id); });
    box.querySelectorAll("[data-rm]").forEach(e => e.onclick = async () => { l.items.splice(+e.dataset.rm, 1); await touch(); openList(id); });
    box.querySelectorAll(".t[data-i]").forEach(e => e.onclick = () => sing(l.id, +e.dataset.i));
    if (q("#ls-go")) q("#ls-go").onclick = () => sing(l.id, 0);
    q("#ls-share").onclick = async () => {
      const text = `${l.title} — ${nice(l.date)}\n` + l.items.map((it, i) => { const s = song(it.songId); return `${i + 1}. ${num(s)} ${titleOf(s)}${it.key ? " (" + it.key + ")" : ""}`; }).join("\n");
      try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast("Copied — paste it in WhatsApp"); } } catch { }
    };
    if (q("#ls-send")) q("#ls-send").onclick = async () => { const ok = await app.sendList(l); if (ok) { l.sent = new Date().toISOString(); await save(); openList(id); } };
    q("#ls-del").onclick = async () => { if (!confirm(`Delete “${l.title}”?`)) return; lists = lists.filter(x => x.id !== id); await save(); openLists(); };
  }

  // ---------- go through the list song by song ----------
  function sing(listId, index) {
    const l = lists.find(x => x.id === listId); const it = l?.items[index]; if (!it) return;
    ctx = { listId, index }; document.querySelectorAll(".ls").forEach(x => x.remove());
    const s = song(it.songId); app.setSemis(it.key && s?.key ? semisBetween(s.key, it.key) : 0);
    app.open(it.songId);
  }
  // "＋ List" on a song
  async function pick(songId) {
    await loaded;
    const box = document.createElement("div"); box.className = "pick";
    const upcoming = lists.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
    box.innerHTML = `<b>Add to a list</b>${upcoming.map(l => `<button class="o" data-id="${l.id}">${esc(l.title)} · ${esc(nice(l.date))} (${l.items.length})</button>`).join("")}<button class="o" data-id="new">＋ New list for ${esc(nice(nextSunday()))}</button><button class="o" data-id="" style="color:var(--muted)">Cancel</button>`;
    document.body.appendChild(box);
    box.querySelectorAll("[data-id]").forEach(b => b.onclick = async () => {
      box.remove(); if (!b.dataset.id) return;
      const l = b.dataset.id === "new" ? newList() : lists.find(x => x.id === b.dataset.id);
      if (l.items.some(x => x.songId === songId)) return toast("Already in this list");
      const s = song(songId); l.items.push({ songId, key: s?.key || "" }); l.updated = new Date().toISOString(); await save();
      toast(`Added to “${l.title}” (${l.items.length})`);
    });
  }

  return {
    openLists,
    tool: () => `<button class="ib" id="ls-add">＋ List</button>`,
    // list bar above the song when singing through a list
    nav(songId) {
      const l = ctx && lists.find(x => x.id === ctx.listId);
      if (!l || l.items[ctx.index]?.songId !== songId) { ctx = null; return ""; }
      const it = l.items[ctx.index];
      return `<div class="lnav"><button class="ib" id="ln-p" ${ctx.index ? "" : "disabled"}>‹</button><b id="ln-l">☰ ${esc(l.title)} · ${ctx.index + 1}/${l.items.length}${it.key ? " · Key " + esc(it.key) : ""}</b><button class="ib" id="ln-n" ${ctx.index < l.items.length - 1 ? "" : "disabled"}>›</button></div>`;
    },
    bind(songId) {
      const b = document.getElementById("ls-add"); if (b) b.onclick = () => pick(songId);
      const p = document.getElementById("ln-p"), n = document.getElementById("ln-n"), lb = document.getElementById("ln-l");
      if (p) p.onclick = () => sing(ctx.listId, ctx.index - 1);
      if (n) n.onclick = () => sing(ctx.listId, ctx.index + 1);
      if (lb) lb.onclick = () => openList(ctx.listId);
    },
  };
}
