// Read song files the church already has into Revival Worship songs (kept in this computer's library only).
// Formats: OpenLyrics XML (OpenLP, many apps), OpenSong, ChordPro (.cho/.chordpro/.pro), FreeShow (.show),
// VerseVIEW exports (XML / JSON, best effort), plain text (.txt).
import { textToSections } from "./song-text.js";
import { romanize, capitalizeLines } from "./translit.js";
import { krutiToUnicode, looksLikeKruti } from "./krutidev.js";

const isDeva = (s) => /[ऀ-ॿ]/.test(s || "");
const LABEL = { v: "Verse", c: "Chorus", b: "Bridge", p: "Pre-Chorus", i: "Intro", e: "Ending", o: "Other", t: "Tag" };
const labelFromCode = (code = "") => { const m = String(code).trim().match(/^([a-z]+?)(\d*)([a-z]?)$/i); if (!m) return code; const base = LABEL[m[1][0].toLowerCase()] || m[1]; return base + (m[2] ? " " + m[2] : "") + (m[3] || ""); };
const cleanLines = (arr) => arr.map(l => l.replace(/\s+$/, "")).filter(l => l.trim() !== "");

export function makeSong({ title, author = "", key = "", category = "", tags = [], notes = "", order = "", sections = [], sections2 = null, title2 = "", source, legacy = false }) {
  sections = sections.map(s => ({ label: s.label || "Verse", lines: cleanLines(s.lines) })).filter(s => s.lines.length);
  if (!sections.length) return null;
  const text = sections.map(s => s.lines.join("\n")).join("\n");
  const fixKruti = legacy && looksLikeKruti(text);     // only old Word/VerseVIEW text can be Kruti Dev; song apps save Unicode
  if (fixKruti) sections = sections.map(s => ({ ...s, lines: s.lines.map(krutiToUnicode) }));
  const lang = isDeva(sections.map(s => s.lines.join(" ")).join(" ")) ? "hi" : "en";
  const versions = { [lang]: { title: title || "Untitled", sections } };
  if (sections2 && sections2.length) {
    const l2 = isDeva(sections2.map(s => s.lines.join(" ")).join(" ")) ? "hi" : (lang === "hi" ? "hi-Latn" : "en");
    if (l2 !== lang) versions[l2] = { title: title2 || title, sections: sections2.map(s => ({ label: s.label, lines: cleanLines(s.lines) })) };
  }
  if (versions.hi && !versions["hi-Latn"]) versions["hi-Latn"] = { title: capitalizeLines(romanize(versions.hi.title)), sections: versions.hi.sections.map(s => ({ label: s.label, lines: capitalizeLines(romanize(s.lines.join("\n"))).split("\n") })), auto: true };
  return { title: title || "Untitled", lang, key, author, category, tags, notes, order, versions, source, fixedKruti: fixKruti };
}

// ---------- OpenLyrics ----------
function openLyrics(doc, source) {
  const q = (sel, el = doc) => el.getElementsByTagName(sel);
  const songs = [...q("song")];
  return songs.map(song => {
    const t = [...q("title", song)].map(x => x.textContent.trim());
    const verses = [...q("verse", song)].map(v => {
      const lines = [];
      for (const ln of q("lines", v)) {
        let cur = "";
        const walk = (node) => {
          for (const c of node.childNodes) {
            if (c.nodeType === 3) cur += c.textContent.replace(/\s*\n\s*/g, " ");
            else if (c.nodeName === "br") { lines.push(cur); cur = ""; }
            else if (c.nodeName === "chord") { cur += `[${c.getAttribute("name") || c.getAttribute("root") || ""}]`; walk(c); }
            else if (c.nodeName !== "comment") walk(c);
          }
        };
        walk(ln); lines.push(cur); lines.push("");
      }
      return { label: labelFromCode(v.getAttribute("name")), lines };
    });
    return makeSong({ title: t[0], title2: t[1], author: [...q("author", song)].map(a => a.textContent.trim()).join(", "), key: q("key", song)[0]?.textContent.trim() || "",
      tags: [...q("theme", song)].map(x => x.textContent.trim()), order: (q("verseOrder", song)[0]?.textContent || "").trim().split(/\s+/).map(labelFromCode).join(", "), sections: verses, source });
  }).filter(Boolean);
}
// ---------- OpenSong ----------
function openSong(doc, source) {
  const g = (n) => doc.getElementsByTagName(n)[0]?.textContent || "";
  const sections = []; let cur = null, chordLine = null;
  for (const raw of g("lyrics").split(/\r?\n/)) {
    const hm = raw.match(/^\[([^\]]+)\]/);
    if (hm) { cur = { label: labelFromCode(hm[1]), lines: [] }; sections.push(cur); continue; }
    if (raw.startsWith(";")) continue;
    if (raw.startsWith(".")) { chordLine = raw.slice(1); continue; }
    let text = raw.replace(/^[ 1-9]/, "").replace(/[_|]/g, " ");
    if (chordLine) { // merge chords above into inline [G] marks
      let out = "", pos = 0; const re = /\S+/g; let m;
      while ((m = re.exec(chordLine))) { out += text.slice(pos, m.index) + `[${m[0]}]`; pos = m.index; }
      text = out + text.slice(pos); chordLine = null;
    }
    if (!cur) { cur = { label: "Verse 1", lines: [] }; sections.push(cur); }
    cur.lines.push(text);
  }
  return [makeSong({ title: g("title"), author: g("author"), key: g("key"), tags: g("theme") ? g("theme").split(/[;,]/).map(s => s.trim()) : [], order: g("presentation").trim().split(/\s+/).map(labelFromCode).join(", "), sections, source })].filter(Boolean);
}
// ---------- ChordPro ----------
function chordPro(text, name, source) {
  const meta = { title: "", author: "", key: "" }; const sections = []; let cur = null; let n = 0;
  const start = (label) => { cur = { label, lines: [] }; sections.push(cur); };
  for (const raw of text.split(/\r?\n/)) {
    const d = raw.match(/^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i);
    if (d) {
      const k = d[1].toLowerCase(), v = d[2] || "";
      if (k === "title" || k === "t") meta.title = v;
      else if (["artist", "composer", "lyricist", "author"].includes(k)) meta.author = meta.author || v;
      else if (k === "key") meta.key = v;
      else if (k === "soc" || k === "start_of_chorus") start(v || "Chorus");
      else if (k === "sov" || k === "start_of_verse") start(v || `Verse ${++n}`);
      else if (k === "sob" || k === "start_of_bridge") start(v || "Bridge");
      else if (/^(eoc|eov|eob|end_of_)/.test(k)) cur = null;
      else if (k === "c" || k === "comment") start(v || `Verse ${++n}`);
      continue;
    }
    if (raw.startsWith("#")) continue;
    if (!raw.trim()) { if (cur && cur.lines.length) cur = null; continue; }
    if (!cur) start(`Verse ${++n}`);
    cur.lines.push(raw);
  }
  return [makeSong({ ...meta, title: meta.title || name, sections, source })].filter(Boolean);
}
// ---------- FreeShow .show (JSON: [id, show]) ----------
function freeShow(json, name, source) {
  const show = Array.isArray(json) ? json[1] : json;
  if (!show?.slides) return [];
  const layout = Object.values(show.layouts || {})[0];
  const ids = layout?.slides?.map(s => s.id) || Object.keys(show.slides);
  const seen = new Set(), sections = [], order = [];
  for (const id of ids) {
    const sl = show.slides[id]; if (!sl) continue;
    const label = sl.group || "Verse";
    order.push(label);
    if (seen.has(id)) continue; seen.add(id);
    const lines = [];
    for (const it of sl.items || []) for (const ln of it.lines || []) lines.push((ln.text || []).map(t => t.value || "").join(""));
    const children = (sl.children || []).map(cid => show.slides[cid]).filter(Boolean);
    for (const ch of children) for (const it of ch.items || []) for (const ln of it.lines || []) lines.push((ln.text || []).map(t => t.value || "").join(""));
    sections.push({ label, lines });
  }
  return [makeSong({ title: show.name || name, author: show.meta?.author || show.meta?.artist || "", key: show.meta?.key || "", category: show.category || "", sections, order: "", source })].filter(Boolean);
}
// ---------- VerseVIEW (best effort: XML or JSON exports) ----------
function verseView(data, source) {
  const out = [];
  const pick = (o, keys) => { for (const k of keys) { const hit = Object.keys(o).find(x => x.toLowerCase() === k); if (hit && o[hit] != null && o[hit] !== "") return o[hit]; } return ""; };
  const toSections = (v) => {
    if (Array.isArray(v)) return v.map((x, i) => ({ label: `Verse ${i + 1}`, lines: String(typeof x === "object" ? (x.text || x.lyrics || Object.values(x).join("\n")) : x).split(/\r?\n|<br\s*\/?>/i) }));
    const txt = String(v || "").replace(/<slide>/gi, "\n\n").replace(/<\/slide>/gi, "").replace(/<br\s*\/?>/gi, "\n");
    return /^\s*\[/m.test(txt) ? textToSections(txt) : txt.split(/\n\s*\n|<slide>/i).map((p, i) => ({ label: `Verse ${i + 1}`, lines: p.split(/\r?\n/) }));
  };
  const items = Array.isArray(data) ? data : data.songs || data.Songs || data.items || Object.values(data).find(Array.isArray) || [];
  for (const o of items) {
    if (!o || typeof o !== "object") continue;
    const title = pick(o, ["name", "title", "songname", "song_title"]);
    const lyr = pick(o, ["lyrics", "slides", "text", "content", "lyrics1"]);
    const lyr2 = pick(o, ["lyrics2", "slides2", "text2", "translation"]);
    if (!title || !lyr) continue;
    const s = makeSong({ title, title2: pick(o, ["name2", "title2"]), author: pick(o, ["author", "lyricsby", "lyrics_by", "writer"]), key: pick(o, ["key"]), category: pick(o, ["category", "cat"]),
      tags: String(pick(o, ["tags", "tag"]) || "").split(/[,;]/).map(x => x.trim()).filter(Boolean), notes: pick(o, ["notes", "note"]), sections: toSections(lyr), sections2: lyr2 ? toSections(lyr2) : null, source, legacy: true });
    if (s) out.push(s);
  }
  return out;
}
function xmlToObjects(doc) {                // generic XML → [{tag: text}] for VerseVIEW-like exports
  const rows = [];
  for (const el of doc.getElementsByTagName("*")) {
    const kids = [...el.children];
    if (kids.length >= 2 && kids.some(k => /^(name|title)$/i.test(k.nodeName)) && kids.some(k => /^(lyrics|slides?|text|content)/i.test(k.nodeName))) {
      const o = {}; for (const k of kids) o[k.nodeName] = k.children.length ? [...k.children].map(c => c.textContent).join("\n\n") : k.textContent; rows.push(o);
    }
  }
  return rows;
}

// ---------- entry ----------
export async function parseSongFile(file) {
  const name = file.name.replace(/\.[^.]+$/, "");
  const ext = (file.name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
  const text = await file.text();
  try {
    if (/^\s*</.test(text)) {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) throw new Error("Not valid XML");
      const root = doc.documentElement.nodeName.toLowerCase();
      if (doc.getElementsByTagName("lyrics")[0]?.getElementsByTagName("verse").length || /openlyrics/.test(doc.documentElement.namespaceURI || "")) return { format: "OpenLyrics", songs: openLyrics(doc, "import:openlyrics") };
      if (root === "song" && doc.getElementsByTagName("lyrics").length) return { format: "OpenSong", songs: openSong(doc, "import:opensong") };
      const rows = xmlToObjects(doc);
      if (rows.length) return { format: "VerseVIEW / XML", songs: verseView(rows, "import:versevview") };
      return { format: "XML", songs: [], error: "Unknown XML song format" };
    }
    if (["cho", "chordpro", "chopro", "pro", "crd"].includes(ext) || /\{\s*(title|t|soc|start_of_chorus)\s*[:}]/i.test(text)) return { format: "ChordPro", songs: chordPro(text, name, "import:chordpro") };
    if (/^\s*[[{]/.test(text)) {
      const json = JSON.parse(text);
      if ((Array.isArray(json) && json[1]?.slides) || json.slides) return { format: "FreeShow", songs: freeShow(json, name, "import:freeshow") };
      return { format: "VerseVIEW / JSON", songs: verseView(json, "import:versevview") };
    }
    // plain text: first line = title when followed by a blank line
    const lines = text.replace(/\r/g, "").split("\n");
    let title = name, body = text;
    if (lines.length > 2 && lines[0].trim() && !lines[1].trim() && !/^\[/.test(lines[0])) { title = lines[0].trim(); body = lines.slice(2).join("\n"); }
    return { format: "Text", songs: [makeSong({ title, sections: textToSections(body), source: "import:text", legacy: true })].filter(Boolean) };
  } catch (e) { return { format: ext.toUpperCase() || "?", songs: [], error: e.message }; }
}
