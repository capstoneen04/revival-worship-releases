// Kruti Dev 010 / 718 (legacy Hindi font encoding) -> Unicode Devanagari converter.
// Works in browser (ES module) and Node (import).

const PAIRS = [
  ["ñ", "॰"], ["Q+Z", "QZ+"], ["sas", "sa"], ["aa", "a"], [")Z", "र्द्ध"], ["ZZ", "Z"],
  ["‘", "\""], ["’", "\""], ["“", "'"], ["”", "'"],
  ["å", "०"], ["ƒ", "१"], ["„", "२"], ["…", "३"], ["†", "४"], ["‡", "५"], ["ˆ", "६"], ["‰", "७"], ["Š", "८"], ["‹", "९"],
  ["¶+", "फ़्"], ["d+", "क़"], ["[+k", "ख़"], ["[+", "ख़्"], ["x+", "ग़"], ["T+", "ज़्"], ["t+", "ज़"], ["M+", "ड़"], ["<+", "ढ़"], ["Q+", "फ़"], [";+", "य़"], ["j+", "ऱ"], ["u+", "ऩ"],
  ["Ùk", "त्त"], ["Ù", "त्त्"], ["Dr", "क्त"], ["–", "दृ"], ["—", "कृ"], ["é", "न्न"], ["™", "न्न्"], ["=kk", "=k"], ["f=k", "f="],
  ["à", "ह्न"], ["á", "ह्य"], ["â", "हृ"], ["ã", "ह्म"], ["ºz", "ह्र"], ["º", "ह्"], ["í", "द्द"], ["{k", "क्ष"], ["{", "क्ष्"], ["=", "त्र"], ["«", "त्र्"],
  ["Nî", "छ्य"], ["Vî", "ट्य"], ["Bî", "ठ्य"], ["Mî", "ड्य"], ["<î", "ढ्य"], ["|", "द्य"], ["K", "ज्ञ"], ["}", "द्व"],
  ["J", "श्र"], ["Vª", "ट्र"], ["Mª", "ड्र"], ["<ªª", "ढ्र"], ["Nª", "छ्र"], ["Ø", "क्र"], ["Ý", "फ्र"], ["nzZ", "र्द्र"], ["æ", "द्र"], ["ç", "प्र"], ["Á", "प्र"], ["xz", "ग्र"], ["#", "रु"], [":", "रू"],
  ["v‚", "ऑ"], ["vks", "ओ"], ["vkS", "औ"], ["vk", "आ"], ["v", "अ"], ["b±", "ईं"], ["Ã", "ई"], ["bZ", "ई"], ["b", "इ"], ["m", "उ"], ["Å", "ऊ"], [",s", "ऐ"], [",", "ए"], ["_", "ऋ"],
  ["ô", "क्क"], ["d", "क"], ["Dk", "क"], ["D", "क्"], ["£", "ख्"], ["[k", "ख"], ["[", "ख्"], ["x", "ग"], ["Xk", "ग"], ["X", "ग्"], ["Ä", "घ"], ["?k", "घ"], ["?", "घ्"], ["³", "ङ"],
  ["pkS", "चै"], ["p", "च"], ["Pk", "च"], ["P", "च्"], ["N", "छ"], ["t", "ज"], ["Tk", "ज"], ["T", "ज्"], [">", "झ"], ["÷", "झ्"], ["¥", "ञ"],
  ["ê", "ट्ट"], ["ë", "ट्ठ"], ["V", "ट"], ["B", "ठ"], ["ì", "ड्ड"], ["ï", "ड्ढ"], ["M", "ड"], ["<", "ढ"], [".k", "ण"], [".", "ण्"],
  ["r", "त"], ["Rk", "त"], ["R", "त्"], ["Fk", "थ"], ["F", "थ्"], [")", "द्ध"], ["n", "द"], ["/k", "ध"], ["èk", "ध"], ["/", "ध्"], ["Ë", "ध्"], ["è", "ध्"], ["u", "न"], ["Uk", "न"], ["U", "न्"],
  ["i", "प"], ["Ik", "प"], ["I", "प्"], ["Q", "फ"], ["¶", "फ्"], ["c", "ब"], ["Ck", "ब"], ["C", "ब्"], ["Hk", "भ"], ["H", "भ्"], ["e", "म"], ["Ek", "म"], ["E", "म्"],
  [";", "य"], ["¸", "य्"], ["j", "र"], ["y", "ल"], ["Yk", "ल"], ["Y", "ल्"], ["G", "ळ"], ["o", "व"], ["Ok", "व"], ["O", "व्"],
  ["'k", "श"], ["'", "श्"], ["\"k", "ष"], ["\"", "ष्"], ["l", "स"], ["Lk", "स"], ["L", "स्"], ["g", "ह"],
  ["È", "ीं"], ["z", "्र"],
  ["Ì", "द्द"], ["Í", "ट्ट"], ["Î", "ट्ठ"], ["Ï", "ड्ड"], ["Ñ", "कृ"], ["Ò", "भ"], ["Ó", "्य"], ["Ô", "ड्ढ"], ["Ö", "झ्"], ["Ü", "श"],
  ["‚", "ॉ"], ["ks", "ो"], ["kS", "ौ"], ["k", "ा"], ["h", "ी"], ["q", "ु"], ["w", "ू"], ["`", "ृ"], ["s", "े"], ["S", "ै"],
  ["a", "ं"], ["¡", "ँ"], ["%", "ः"], ["W", "ॅ"], ["•", "ऽ"], ["·", "ऽ"], ["∙", "ऽ"], ["~j", "्र"], ["~", "्"], ["\\", "?"], ["+", "़"],
  ["^", "‘"], ["*", "’"], ["Þ", "“"], ["ß", "”"], ["¼", "("], ["½", ")"], ["¿", "{"], ["À", "}"], ["¾", "="], ["A", "।"], ["-", "."], ["&", "-"], ["Œ", "॰"], ["]", ","], ["@", "/"],
];
// Longest-match-first table
const TABLE = new Map(PAIRS.map(([a, b]) => [a, b]));
const KEYS_BY_LEN = [...new Set(PAIRS.map(p => p[0]))].sort((a, b) => b.length - a.length);
const MAXLEN = KEYS_BY_LEN[0].length;

const CONS = "कखगघङचछजझञटठडढणतथदधनपफबभमयरलळवशषसहक़ख़ग़ज़ड़ढ़फ़य़ऱऩ";
const MATRAS = "ािीुूृेैोौंँःॅॉ़";
const isCons = c => CONS.includes(c);

function rawReplace(s) {
  // Single-pass longest-match tokenisation (avoids re-replacing output)
  let out = "";
  let i = 0;
  while (i < s.length) {
    let hit = null;
    for (let L = Math.min(MAXLEN, s.length - i); L >= 1; L--) {
      const sub = s.substr(i, L);
      if (TABLE.has(sub)) { hit = sub; break; }
    }
    if (hit) {
      out += TABLE.get(hit);
      i += hit.length;
    } else {
      // 'f' (i-matra) and 'Z' (reph) are kept as markers for the reorder pass
      out += s[i];
      i++;
    }
  }
  return out;
}

function reorder(s) {
  // 1) i-matra: Kruti writes 'f' BEFORE the consonant (cluster). Move it after.
  let chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== "f") continue;
    // find end of consonant cluster after f: C(्C)*(़)?
    let j = i + 1;
    if (j < chars.length && isCons(chars[j])) {
      j++;
      while (j < chars.length) {
        if (chars[j] === "़") { j++; continue; }
        if (chars[j] === "्" && j + 1 < chars.length && isCons(chars[j + 1])) { j += 2; continue; }
        break;
      }
      chars.splice(i, 1);
      chars.splice(j - 1, 0, "ि");
      i = j - 1;
    } else {
      chars[i] = "ि";
    }
  }
  // 2) reph 'Z' : written after the syllable; Unicode wants र् before the consonant cluster.
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== "Z") continue;
    let j = i - 1;
    while (j >= 0 && MATRAS.includes(chars[j])) j--;          // skip matras
    // j now at consonant; include preceding half consonants  C्
    while (j - 2 >= 0 && chars[j - 1] === "्" && isCons(chars[j - 2])) j -= 2;
    chars.splice(i, 1);
    if (j < 0) j = 0;
    chars.splice(j, 0, "र", "्");
    i++;
  }
  let out = chars.join("");
  // common clean-ups
  out = out
    .replace(/्ा/g, "")            // half + aa = full
    .replace(/ाे/g, "ो").replace(/ाै/g, "ौ")
    .replace(/अो/g, "ओ").replace(/अौ/g, "औ").replace(/आे/g, "ओ").replace(/आै/g, "औ")
    .replace(/ं़/g, "़ं").replace(/ँ़/g, "़ँ")
    .replace(/ि्र/g, "्रि")
    .replace(/ँू/g, "ूँ").replace(/ँु/g, "ुँ").replace(/ँॅ/g, "ँ").replace(/ॅँ/g, "ँ")
    .replace(/\s+([।,])/g, "$1");
  return out;
}

export function krutiToUnicode(text) {
  if (!text) return "";
  text = text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  return text.split("\n").map(line => reorder(rawReplace(line))).join("\n");
}

// Heuristic: does a string look like Kruti Dev encoded Hindi (vs plain English)?
export function looksLikeKruti(text) {
  if (!text) return false;
  if (/[ऀ-ॿ]/.test(text)) return false;
  const t = text.replace(/[0-9\s.,!?()\-–]/g, "");
  if (t.length < 3) return false;
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const english = words.filter(w => EN_WORDS.has(w)).length;
  if (words.length && english / words.length > 0.3) return false;
  const kFreq = (t.match(/k/g) || []).length / t.length;          // 'k' = aa-matra, very common in Kruti
  const odd = (t.match(/[;\]>½¼\[{}|=]|[a-z][A-Z]/g) || []).length / t.length;
  const hint = /(gS\b|esa\b|dks\b|\brw\b|eS|;s'|izHkq|ifo=|vkRek|eflg|elhg)/.test(text);
  return kFreq > 0.06 || odd > 0.05 || hint;
}
const EN_WORDS = new Set("the and of to in is you that it he was for on are as with his they i at be this have from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part lord jesus god love my me oh his heart sing praise glory holy name".split(" "));
