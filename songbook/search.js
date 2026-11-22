// Song search: numbers, book codes, Devanagari, Hinglish (phonetic), accents-insensitive Latin
import { normalizeLatin, normalizeDeva, phoneticKey, hasDevanagari } from "./translit.js";

export const LANG_NAMES = { hi: "Hindi", "hi-Latn": "Hinglish", en: "English", mr: "Marathi", pt: "Português", es: "Español" };

export function songText(song) {
  const parts = [];
  for (const v of Object.values(song.versions || {})) {
    parts.push(v.title || "");
    for (const s of v.sections || []) parts.push(...s.lines);
  }
  return parts.join("\n");
}

function firstLines(song) {
  const out = [];
  for (const v of Object.values(song.versions || {})) { const s = (v.sections || [])[0]; if (s) out.push(s.lines[0] || ""); }
  return out.join(" | ");
}

// ---------- library clean-up (2.6): language tabs, archived songs, hidden Portuguese/Spanish numbers ----------
// Tabs: English · Hindi · Hinglish (the Hindi songs in English letters + songs written in Hinglish) · Marathi.
// 2.6.1: archived songs are gone from the library (Br. Enoch, 22 Nov 2026). An old id (a set list, a service) opens
// the song it was merged into through the library's `moved` map {oldId: newId}. A song still flagged archived on a
// computer that has not updated yet is simply never listed or found.
export const TABS = [["en", "English"], ["hi", "हिंदी Hindi"], ["hl", "Hinglish"], ["mr", "मराठी Marathi"]];
export const HIDDEN_BOOKS = new Set(["PT", "ES"]);
export const ENGLISH_BOOKS = ["STL", "STLA", "TE", "OB"];
export const visibleBooks = (s) => (s.books || []).filter(b => !HIDDEN_BOOKS.has(b.book));
export function inTab(s, tab) {
  const L = s.lang, v = s.versions || {};
  if (tab === "en") return L === "en";
  if (tab === "hi") return L === "hi";
  if (tab === "hl") return L === "hi-Latn" || (L === "hi" && !!v["hi-Latn"]);
  if (tab === "mr") return L === "mr";
  return true;
}
// the version to show in a tab (Hinglish tab → the Hinglish version of a Hindi song)
export function tabVersion(s, tab) { const v = s.versions || {}; return (tab === "hl" && v["hi-Latn"]) || (tab && v[{ en: "en", hi: "hi", mr: "mr" }[tab]]) || v[s.lang] || Object.values(v)[0]; }
function enNum(s) {
  for (const [i, bk] of ENGLISH_BOOKS.entries()) { const b = (s.books || []).find(x => x.book === bk); if (b) return [i, +b.num || 0]; }
  return [9, 0];
}
function tabSort(tab) {
  if (tab === "en") return (a, b) => { const x = enNum(a), y = enNum(b); return x[0] - y[0] || x[1] - y[1] || (a.title || "").localeCompare(b.title || ""); };
  return (a, b) => sortKey(a).localeCompare(sortKey(b));
}
export class SongIndex {
  constructor() { this.items = []; this.byId = new Map(); this.moved = {}; }
  build(songs, moved = {}) {
    this.moved = moved || {};
    const all = songs.filter(s => !s.archived).map(s => this._entry(s));
    this.items = all;
    this.byId = new Map(all.map(e => [e.song.id, e]));
    // old ids (merged copies, removed 2.6.1) open the song they went into — old set lists / services keep working
    for (const id of Object.keys(this.moved)) if (!this.byId.has(id)) { const t = this.resolve(id); if (t) this.byId.set(id, t); }
  }
  resolve(id) {
    let n = 0;
    while (!this.byId.has(id) && this.moved[id] && n++ < 10) id = this.moved[id];
    return this.byId.get(id);
  }
  _entry(s) {
    const titles = [s.title, ...Object.values(s.versions || {}).map(v => v.title || "")].join(" | ");
    const all = songText(s);
    return {
      song: s,
      tLat: normalizeLatin(titles),
      tDev: normalizeDeva(titles),
      tPh: phoneticKey(titles),
      fLat: normalizeLatin(firstLines(s)),
      fDev: normalizeDeva(firstLines(s)),
      aLat: normalizeLatin(all),
      aDev: normalizeDeva(all),
      aPh: " " + phoneticKey(all.replace(/\n/g, " ")) + " ",
      nums: (s.books || []).map(b => ({ book: b.book.toLowerCase(), num: String(b.num) })),
    };
  }
  upsert(song) {
    const e = this._entry(song);
    this.items = this.items.filter(x => x.song.id !== song.id);
    if (song.archived) { this.byId.delete(song.id); return; }
    this.items.push(e);
    this.byId.set(song.id, e);
  }
  remove(id) { this.items = this.items.filter(x => x.song.id !== id); this.byId.delete(id); }

  search(q, { lang = "", tab = "", book = "", status = "", category = "", tag = "", limit = 200 } = {}) {
    q = (q || "").trim();
    let pool = this.items;
    // a tab narrows the list when browsing; a search looks through every language
    if (tab && !q) { pool = pool.filter(e => inTab(e.song, tab)); if (!category && !tag && !lang && !book && !status) return pool.slice().sort((a, b) => tabSort(tab)(a.song, b.song)).slice(0, limit).map(e => ({ song: e.song, score: 0 })); }
    if (category) pool = pool.filter(e => (e.song.category || "") === category);
    if (tag) pool = pool.filter(e => (e.song.tags || []).includes(tag));
    if (lang) pool = pool.filter(e => e.song.versions && e.song.versions[lang]);
    if (book) pool = pool.filter(e => e.nums.some(n => n.book === book.toLowerCase()));
    if (status) pool = pool.filter(e => (e.song.status || "review") === status);
    if (!q) return pool.slice().sort((a, b) => (tab ? tabSort(tab) : (x, y) => sortKey(x).localeCompare(sortKey(y)))(a.song, b.song)).slice(0, limit).map(e => ({ song: e.song, score: 0 }));

    // number / book code: "56", "stl 56", "te1004"
    const nm = q.toLowerCase().match(/^([a-z]{1,4})?\s*(\d{1,4})$/);
    if (nm) {
      const [, code, num] = nm;
      const hits = pool.filter(e => e.nums.some(n => n.num === num && (!code || n.book === code)));
      return hits.map(e => ({ song: e.song, score: 1000 })).slice(0, limit);
    }
    const dev = hasDevanagari(q);
    const qLat = normalizeLatin(q), qDev = normalizeDeva(q), qPh = phoneticKey(q);
    const res = [];
    for (const e of pool) {
      let sc = 0;
      if (dev) {
        if (!qDev) continue;
        if (e.tDev.startsWith(qDev)) sc += 120; else if (e.tDev.includes(qDev)) sc += 80;
        if (e.fDev.includes(qDev)) sc += 50;
        if (!sc && e.aDev.includes(qDev)) sc += 25;
      } else {
        if (qLat) {
          if (e.tLat.startsWith(qLat)) sc += 120; else if (e.tLat.includes(qLat)) sc += 80;
          if (e.fLat.includes(qLat)) sc += 50;
          if (!sc && e.aLat.includes(qLat)) sc += 25;
        }
      }
      // phonetic (Hinglish ↔ Devanagari, spelling variants)
      if (qPh && qPh.length >= 2) {
        if (e.tPh.startsWith(qPh)) sc += 60; else if (e.tPh.includes(qPh)) sc += 40;
        else if (!sc && e.aPh.includes(" " + qPh)) sc += 15;
      }
      if (sc) res.push({ song: e.song, score: sc - Math.min(10, e.song.title.length / 20) });
    }
    res.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));
    return res.slice(0, limit);
  }
}

function sortKey(s) { return (s.lang === "hi" ? "0" : s.lang === "en" ? "1" : "2") + (s.title || "").toLowerCase(); }

export function bookLabel(books, ref) {
  const map = { RH: "RH", HW: "HW", CS: "CS", S19: "H19", SK: "SK", STL: "STL", STLA: "STLA", TE: "TE", OB: "OB", PT: "PT", ES: "ES", HL: "HL" };
  return `${map[ref.book] || ref.book} ${ref.num}`;
}
