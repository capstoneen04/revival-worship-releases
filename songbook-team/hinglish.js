// Hinglish (Hindi typed in English letters) → Hindi (Devanagari).
// 1) a dictionary of the words in the church's own songs (yeshu → येशु, jeevan → जीवन, sharan → शरण …), with a
//    "spelling-free" key so pyar / pyaar / pyaarr all match; 2) spelling rules for words that are not in it.
// Words found only by the rules are reported back so they can be checked.
let DICT = null;
export async function loadHinglishDict(url = "data/hinglish-dict.json") {
  if (DICT) return DICT;
  try { const r = await fetch(url); DICT = r.ok ? await r.json() : { w: {}, k: {} }; } catch { DICT = { w: {}, k: {} }; }
  return DICT;
}
export function setHinglishDict(d) { DICT = d; }

// spelling-free key: same consonant skeleton → same word (pyar = pyaar, mein = mai, jeevan = jivan)
export function skeleton(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, "").replace(/w/g, "v").replace(/ph/g, "f").replace(/q/g, "k").replace(/z/g, "j").replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/(.)\1+/g, "$1");
  if (!w) return "";
  const end = (w.length > 1 && /[aeiou]$/.test(w)) ? w.slice(-1) : "";        // pyar ≠ pyara, aye ≠ aya
  return w[0] + w.slice(1).replace(/[aeiouy]/g, (m, i, s) => (m === "y" && /[aeiou]/.test(s[i + 1] || "") ? "y" : "")) + end;
}

// ---------- spelling rules ----------
const V = [["aa", "आ", "ा"], ["ai", "ऐ", "ै"], ["au", "औ", "ौ"], ["ou", "औ", "ौ"], ["ee", "ई", "ी"], ["ii", "ई", "ी"], ["oo", "ऊ", "ू"], ["uu", "ऊ", "ू"],
  ["a", "अ", ""], ["i", "इ", "ि"], ["u", "उ", "ु"], ["e", "ए", "े"], ["o", "ओ", "ो"]];
const C = [["chh", "छ"], ["shh", "ष"], ["kh", "ख"], ["gh", "घ"], ["ch", "च"], ["jh", "झ"], ["th", "थ"], ["dh", "ध"], ["ph", "फ"], ["bh", "भ"], ["sh", "श"], ["gy", "ज्ञ"],
  ["k", "क"], ["g", "ग"], ["j", "ज"], ["t", "त"], ["d", "द"], ["n", "न"], ["p", "प"], ["b", "ब"], ["m", "म"], ["y", "य"], ["r", "र"], ["l", "ल"], ["v", "व"], ["w", "व"],
  ["s", "स"], ["h", "ह"], ["f", "फ़"], ["z", "ज़"], ["q", "क़"], ["x", "क्स"], ["c", "क"]];
export function spell(word) {
  const w = word.toLowerCase(); let out = "", i = 0, prevCons = false;
  while (i < w.length) {
    const v = V.find(([k]) => w.startsWith(k, i));
    if (v) {
      const atEnd = i + v[0].length === w.length;
      if (prevCons) out += v[0] === "a" && atEnd && i > 1 ? "ा" : v[0] === "i" && atEnd ? "ी" : v[2];   // mera → मेरा, khushi → खुशी, jeevan → जीवन
      else out += v[1];
      i += v[0].length; prevCons = false; continue;
    }
    const c = C.find(([k]) => w.startsWith(k, i));
    if (!c) { out += w[i]; i++; prevCons = false; continue; }
    const next = w.slice(i + c[0].length);
    const nextIsCons = next && !V.some(([k]) => next.startsWith(k));
    if ((c[0] === "n" || c[0] === "m") && !prevCons && out && nextIsCons && !/^[yrlvh]/.test(next)) { out += "ं"; i += 1; continue; }  // dhanyavaad / sambhal → anusvara
    out += c[1] + (nextIsCons ? "्" : "");
    i += c[0].length; prevCons = true;
  }
  return out;
}

// words every church song uses that are not Hindi spellings
const SPECIAL = { hallelujah: "हल्लेलूयाह", halleluyah: "हल्लेलूयाह", halleluya: "हल्लेलूयाह", alleluia: "हल्लेलूयाह", amen: "आमीन", aameen: "आमीन", ameen: "आमीन", hosanna: "होशन्ना", hoshanna: "होशन्ना", jesus: "यीशु", yeshua: "येशुआ", masih: "मसीह", maseeh: "मसीह", immanuel: "इम्मानुएल", emmanuel: "इम्मानुएल" };

// ---------- convert a whole song text ----------
const CHORD = /\[[A-G][#b]?[^\]\s]{0,10}\]/g;
export function hinglishToHindi(text, dict = DICT || { w: {}, k: {} }) {
  const unknown = new Set(); let words = 0, known = 0;
  const conv = (seg) => seg.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (w) => {
    if (/^x\d*$/i.test(w)) return w;                                         // (x2)
    words++;
    const lw = w.toLowerCase().replace(/'/g, "");
    const hit = SPECIAL[lw] || dict.w?.[lw] || dict.k?.[skeleton(lw)];
    if (hit) { known++; return hit; }
    unknown.add(w); return spell(lw);
  });
  const lines = String(text || "").split("\n").map((l) => {
    if (/^\s*\[[^\]]*\]\s*$/.test(l) && !CHORD.test(l)) { CHORD.lastIndex = 0; return l; }   // [Verse 1] labels stay
    CHORD.lastIndex = 0;
    const parts = l.split(/(\[[A-G][#b]?[^\]\s]{0,10}\])/);                         // chords stay
    return parts.map((p, i) => (i % 2 ? p : conv(p))).join("");
  });
  return { text: lines.join("\n"), unknown: [...unknown], words, known };
}
export const looksHinglish = (t) => { const s = String(t || "").replace(/\[[^\]]*\]/g, ""); return /[A-Za-z]{3,}/.test(s) && !/[ऀ-ॿ]/.test(s); };
