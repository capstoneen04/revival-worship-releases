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

export class SongIndex {
  constructor() { this.items = []; this.byId = new Map(); }
  build(songs) {
    this.items = songs.map(s => this._entry(s));
    this.byId = new Map(this.items.map(e => [e.song.id, e]));
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
    const i = this.items.findIndex(x => x.song.id === song.id);
    if (i >= 0) this.items[i] = e; else this.items.push(e);
    this.byId.set(song.id, e);
  }
  remove(id) { this.items = this.items.filter(x => x.song.id !== id); this.byId.delete(id); }

  search(q, { lang = "", book = "", status = "", category = "", tag = "", limit = 200 } = {}) {
    q = (q || "").trim();
    let pool = this.items;
    if (category) pool = pool.filter(e => (e.song.category || "") === category);
    if (tag) pool = pool.filter(e => (e.song.tags || []).includes(tag));
    if (lang) pool = pool.filter(e => e.song.versions && e.song.versions[lang]);
    if (book) pool = pool.filter(e => e.nums.some(n => n.book === book.toLowerCase()));
    if (status) pool = pool.filter(e => (e.song.status || "review") === status);
    if (!q) return pool.slice().sort((a, b) => sortKey(a.song).localeCompare(sortKey(b.song))).slice(0, limit).map(e => ({ song: e.song, score: 0 }));

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
