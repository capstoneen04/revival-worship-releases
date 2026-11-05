// Devanagari -> readable Roman Hindi ("Hinglish"), plus phonetic keys for search.

const VOWELS = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o", "ॲ": "e" };
const MATRA = { "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e" };
const CONS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "ळ": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
  "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f", "य़": "y", "ऱ": "r", "ऩ": "n",
};
const NUKTA_BASE = { "क": "क़", "ख": "ख़", "ग": "ग़", "ज": "ज़", "ड": "ड़", "ढ": "ढ़", "फ": "फ़" };
const DIGITS = "०१२३४५६७८९";

export function hasDevanagari(s) { return /[ऀ-ॿ]/.test(s || ""); }

function romanizeWord(w) {
  const ch = [...w.normalize("NFC")];
  // merge nukta
  const c2 = [];
  for (let i = 0; i < ch.length; i++) {
    if (ch[i + 1] === "़" && NUKTA_BASE[ch[i]]) { c2.push(NUKTA_BASE[ch[i]]); i++; }
    else if (ch[i] !== "़") c2.push(ch[i]);
  }
  let out = [];   // array of {t:text, schwa:bool}
  for (let i = 0; i < c2.length; i++) {
    const c = c2[i];
    if (CONS[c]) {
      const next = c2[i + 1];
      if (next === "्") { out.push({ t: CONS[c], half: true }); i++; continue; }
      if (next && MATRA[next]) { out.push({ t: CONS[c] + MATRA[next] }); i++; continue; }
      out.push({ t: CONS[c], schwa: true });
      continue;
    }
    if (VOWELS[c]) { out.push({ t: VOWELS[c] }); continue; }
    if (c === "ं" || c === "ँ") {
      const prev = out[out.length - 1];
      if (prev && prev.schwa) { prev.t += "a"; prev.schwa = false; }
      out.push({ t: "n" }); continue;
    }
    if (c === "ः") { out.push({ t: "h" }); continue; }
    if (c === "ऽ") { continue; }
    if (DIGITS.includes(c)) { out.push({ t: String(DIGITS.indexOf(c)) }); continue; }
    if (c === "।" || c === "॥") { out.push({ t: "." }); continue; }
    out.push({ t: c });
  }
  // schwa deletion: word-final (unless after a conjunct), and medial VC_CV
  const last = out.length - 1;
  for (let i = 0; i < out.length; i++) {
    const o = out[i];
    if (!o.schwa) continue;
    const prev = out[i - 1], nxt = out[i + 1];
    if (i === last) {
      if (out.length === 1 || (prev && prev.half && prev.t !== "r")) { o.t += "a"; }
      o.schwa = false; continue;
    }
    const prevVowel = prev && !prev.half && (/[aeiou]$/.test(prev.t) || prev.schwa);
    const nextVowel = nxt && !nxt.half && !nxt.schwa && /[aeiou]/.test(nxt.t);
    if (i >= 1 && prevVowel && nextVowel && i + 1 <= last && !(prev && prev.deleted)) { o.schwa = false; o.deleted = true; continue; }
    o.t += "a"; o.schwa = false;
  }
  return out.map(o => o.t).join("");
}

export function romanize(text) {
  if (!text) return "";
  return text.split(/(\s+|[,.!?;:()\-–—"'।॥…]+)/).map(tok => (hasDevanagari(tok) ? romanizeWord(tok) : tok)).join("")
    .replace(/\b(\w{2,}?)aa\b/g, "$1a").replace(/\b(\w+?)ee\b/g, "$1i").replace(/\b(\w{1,2})oo\b/g, "$1u").replace(/oon\b/g, "un").replace(/\bmen\b/g, "mein").replace(/\bmain\b/g, "main").replace(/\byeeshu\b/g, "yeeshu");
}

export function capitalizeLines(text) {
  return text.split("\n").map(l => l.replace(/^(\s*)([a-z])/, (m, a, b) => a + b.toUpperCase())).join("\n");
}

// --- Search normalisation -------------------------------------------------
const ACCENTS = /[̀-ͯ]/g;
export function normalizeLatin(s) {
  return (s || "").normalize("NFD").replace(ACCENTS, "").toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// consonant skeleton key — tolerant of Hinglish spelling variants
export function phoneticKey(s) {
  let t = hasDevanagari(s) ? romanize(s) : s;
  t = normalizeLatin(t);
  return t.split(" ").map(w => {
    w = w.replace(/ph/g, "f").replace(/sh|ss/g, "s").replace(/chh|ch/g, "c").replace(/kh/g, "k").replace(/gh/g, "g")
      .replace(/jh/g, "j").replace(/th/g, "t").replace(/dh/g, "d").replace(/bh/g, "b").replace(/w/g, "v").replace(/z/g, "j")
      .replace(/q/g, "k").replace(/x/g, "ks").replace(/y/g, "y");
    const first = w[0] || "";
    let rest = w.slice(1).replace(/[aeiouh]/g, "");
    rest = rest.replace(/(.)\1+/g, "$1");
    const k = (/[aeiou]/.test(first) ? "a" : first) + rest;
    return k;
  }).filter(Boolean).join(" ");
}

export function normalizeDeva(s) {
  return (s || "").normalize("NFC")
    .replace(/[़ँं]/g, "").replace(/ी/g, "ि").replace(/ू/g, "ु").replace(/ै/g, "े").replace(/ौ/g, "ो")
    .replace(/[य]ि/g, "ये").replace(/[^ऀ-ॿ0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
