// Chords (ChordPro style, inline: "[G]Amazing [C]grace"), transpose, section colours, arrangements.
export const CHORD = String.raw`[A-G](?:#|b)?(?:maj|min|dim|aug|sus|add|m|M|°|ø|\+)?\d{0,2}(?:(?:sus|add|b|#)\d{1,2})*(?:\/[A-G](?:#|b)?)?`;
const CHORD_TOKEN = new RegExp(String.raw`\[(${CHORD})\]`, "g");
const ONLY_CHORD = new RegExp(`^${CHORD}$`);

export const isChord = (s) => ONLY_CHORD.test((s || "").trim());
export const hasChords = (line) => { CHORD_TOKEN.lastIndex = 0; return CHORD_TOKEN.test(line || ""); };
export function stripChords(line) { return (line || "").replace(CHORD_TOKEN, "").replace(/\s{2,}/g, " ").trim(); }
export const songHasChords = (song) => Object.values(song.versions || {}).some(v => (v.sections || []).some(s => s.lines.some(hasChords)));

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const idx = (n) => { let i = SHARP.indexOf(n); if (i < 0) i = FLAT.indexOf(n); return i; };
const NICE = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];   // how musicians usually write them
export function transposeNote(n, semis, flat) {
  const i = idx(n); if (i < 0) return n;
  return (flat === undefined ? NICE : flat ? FLAT : SHARP)[((i + semis) % 12 + 12) % 12];
}
export function transposeChord(ch, semis, flat) {
  if (!semis) return ch;
  return ch.replace(/^([A-G](?:#|b)?)/, (m) => transposeNote(m, semis, flat)).replace(/\/([A-G](?:#|b)?)$/, (m, b) => "/" + transposeNote(b, semis, flat));
}
export function transposeKey(key, semis) {
  if (!key || !semis) return key || "";
  const m = key.match(/^([A-G](?:#|b)?)(.*)$/); if (!m) return key;
  return transposeNote(m[1], semis) + m[2];
}
// "[G]Amazing [C]grace" → { text: "Amazing grace", chords: [{ at: 0, chord: "G" }, { at: 8, chord: "C" }] }
export function splitChordLine(line, semis = 0, flat) {
  const chords = []; let text = ""; let last = 0; let m;
  const re = new RegExp(CHORD_TOKEN.source, "g");
  while ((m = re.exec(line))) { text += line.slice(last, m.index); chords.push({ at: text.length, chord: transposeChord(m[1], semis, flat) }); last = m.index + m[0].length; }
  text += line.slice(last);
  return { text, chords };
}
// two monospace-free rows for HTML: returns [{chord, text}] segments so chords sit above the syllable
export function chordSegments(line, semis = 0, flat) {
  const { text, chords } = splitChordLine(line, semis, flat);
  if (!chords.length) return [{ chord: "", text }];
  const segs = []; if (chords[0].at > 0) segs.push({ chord: "", text: text.slice(0, chords[0].at) });
  chords.forEach((c, i) => segs.push({ chord: c.chord, text: text.slice(c.at, i + 1 < chords.length ? chords[i + 1].at : text.length) }));
  return segs;
}

// ---------- section types and colours (as in FreeShow / Presenter) ----------
export const SECTION_TYPES = [
  ["verse", /^(verse|v\d|stanza|charan|चरण|पद)/i, "#3b82f6"],
  ["prechorus", /^(pre-?chorus|pc\b)/i, "#14b8a6"],
  ["chorus", /^(chorus|refrain|c\d?\b|koras|कोरस|टेक)/i, "#e5484d"],
  ["bridge", /^(bridge|b\d?\b)/i, "#9b6bff"],
  ["intro", /^(intro|i\b)/i, "#7c8595"],
  ["outro", /^(outro|ending|end|o\b|e\b)/i, "#7c8595"],
  ["tag", /^(tag|t\b)/i, "#30a46c"],
];
export function sectionType(label = "") { for (const [k, re] of SECTION_TYPES) if (re.test(label.trim())) return k; return "other"; }
export function sectionColor(label = "") { for (const [, re, c] of SECTION_TYPES) if (re.test(label.trim())) return c; return "#d4a24c"; }

// ---------- arrangement: "V1 C V2 C B C" or "Verse 1, Chorus, Verse 2" ----------
const SHORT = { v: "Verse", c: "Chorus", b: "Bridge", p: "Pre-Chorus", pc: "Pre-Chorus", i: "Intro", o: "Outro", e: "Ending", t: "Tag" };
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, "");
export function parseOrder(order, sections) {
  if (!order || !order.trim() || !sections?.length) return null;
  const tokens = order.includes(",") ? order.split(",") : order.trim().split(/\s+/);
  const out = [];
  for (let t of tokens) {
    t = t.trim(); if (!t) continue;
    let want = t;
    const m = t.match(/^(pc|[vcbpioet])(\d*)$/i);
    if (m) want = SHORT[m[1].toLowerCase()] + (m[2] ? " " + m[2] : "");
    let i = sections.findIndex(s => norm(s.label) === norm(want));
    if (i < 0 && m && !m[2]) i = sections.findIndex(s => norm(s.label).startsWith(norm(SHORT[m[1].toLowerCase()])));
    if (i < 0) i = sections.findIndex(s => norm(s.label).startsWith(norm(want)));
    if (i >= 0) out.push(i);
  }
  return out.length ? out : null;
}
export function orderLabel(sections) {             // default short form for the editor hint
  return (sections || []).map(s => { const m = s.label.match(/^(\w)\w*\s*(\d*)/); return m ? (m[1].toUpperCase() + (m[2] || "")) : s.label; }).join(" ");
}
