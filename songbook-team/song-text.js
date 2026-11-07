// Song text <-> sections ("[Verse 1]\nline\n\n[Chorus]…"). Shared by the app and the phone team songbook.
import { isChord } from "./chords.js";

export function sectionsToText(sections) {
  return (sections || []).map(s => `[${s.label}]\n${s.lines.join("\n")}`).join("\n\n");
}
export function textToSections(text) {
  const out = []; let cur = null; let v = 0;
  const lines = text.replace(/\r/g, "").split("\n");
  for (const raw of lines) {
    const l = raw.trim();
    const m = l.match(/^\[(.+)\]$/);
    if (m && !isChord(m[1])) { cur = { label: m[1].trim(), lines: [] }; out.push(cur); continue; }
    const bare = l.match(/^(verse|chorus|bridge|pre-?chorus|intro|outro|ending|tag|refrain|koras|कोरस|चरण|अंतरा)(\s*\d+)?\s*:?$/i);   // "Verse 1" / "Chorus:" on its own line
    if (bare && (!cur || !cur.lines.length)) { if (cur && !cur.lines.length) out.pop(); cur = { label: l.replace(/:$/, "").trim().replace(/^./, c => c.toUpperCase()), lines: [] }; out.push(cur); continue; }
    if (!l) { if (cur && cur.lines.length) cur = null; continue; }
    if (!cur) {
      const isFirst = out.length === 0;
      cur = { label: isFirst ? "Verse 1" : `Verse ${out.filter(s => /^Verse/.test(s.label)).length + 1}`, lines: [] };
      out.push(cur);
    }
    cur.lines.push(l);
  }
  return out.filter(s => s.lines.length);
}
