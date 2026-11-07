// Image → text with Tesseract (Hindi, English, Marathi…). Shared by the app and the phone team songbook.
export const OCR_LANGS = { hin: "Hindi", eng: "English", mar: "Marathi", por: "Português", spa: "Español" };
let worker = null, workerLangs = "";

export async function loadTesseract(base = "") {
  if (window.Tesseract) return;
  await new Promise((res, rej) => { const s = document.createElement("script"); s.src = base + "vendor/tesseract/tesseract.min.js"; s.onload = res; s.onerror = () => rej(new Error("Could not load OCR engine")); document.head.appendChild(s); });
}
export async function getWorker(langs, logger, root = new URL(".", location.href).href) {
  await loadTesseract(root);
  const key = langs.join("+");
  if (worker && workerLangs === key) return worker;
  if (worker) { await worker.terminate(); worker = null; }
  const base = root;
  worker = await window.Tesseract.createWorker(langs, 1, {
    workerPath: base + "vendor/tesseract/worker.min.js",
    corePath: base + "vendor/tesseract/core",
    langPath: base + "vendor/tesseract/lang",
    gzip: true, workerBlobURL: false, logger,
  });
  workerLangs = key;
  return worker;
}

export function prepCanvas(img, { enhance = true, rotate = 0 } = {}) {
  let w = img.naturalWidth || img.width, hgt = img.naturalHeight || img.height;
  const scale = w < 1400 ? Math.min(2.5, 1800 / w) : w > 3500 ? 3500 / w : 1;
  w = Math.round(w * scale); hgt = Math.round(hgt * scale);
  const c = document.createElement("canvas");
  const rot = ((rotate % 360) + 360) % 360;
  c.width = rot % 180 ? hgt : w; c.height = rot % 180 ? w : hgt;
  const x = c.getContext("2d");
  x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 180); x.drawImage(img, -w / 2, -hgt / 2, w, hgt);
  x.setTransform(1, 0, 0, 1, 0, 0);
  if (enhance) {
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    // grayscale + contrast stretch
    let min = 255, max = 0;
    for (let i = 0; i < p.length; i += 4) { const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = g; if (g < min) min = g; if (g > max) max = g; }
    const lo = min + (max - min) * 0.08, hi = max - (max - min) * 0.15, span = Math.max(1, hi - lo);
    for (let i = 0; i < p.length; i += 4) { let g = (p[i] - lo) / span * 255; g = g < 0 ? 0 : g > 255 ? 255 : g; p[i] = p[i + 1] = p[i + 2] = g; }
    x.putImageData(d, 0, 0);
  }
  return c;
}

export function cleanOcr(t, isHindi) {
  let s = t.replace(/\r/g, "");
  if (isHindi) s = s.replace(/\s*[|]\s*$/gm, "।").replace(/(\S)\s*\|\s*/g, "$1। ").replace(/ +([,।])/g, "$1").replace(/,।/g, ",");
  s = s.replace(/[ \t]+/g, " ").replace(/^ +| +$/gm, "").replace(/-\n(?=[a-z])/g, "");
  let lines = s.split("\n").map(l => {
    if (isHindi && /[\u0900-\u097F]/.test(l)) l = l.replace(/[\s.,:;'‘’"`~_\-a-zA-Z]{3,}$/, m => (/[a-zA-Z]{4,}/.test(m) ? m : (m.trim().startsWith(",") ? "," : "")));
    return l.trim();
  });
  // drop short junk lines (page edges, bleed-through)
  lines = lines.filter(l => !l || /[\u0900-\u097F]{3,}|[A-Za-zÀ-ÿ]{3,}/.test(l.replace(/\s/g, "")) && !(l.length < 12 && !(l.split(/\s+/).some(w => w.replace(/[^\u0900-\u097FA-Za-z]/g, "").length >= 3))));
  // Tesseract often puts a blank line after every line; collapse when that happens
  const text = lines.filter(Boolean).length, blanks = lines.filter(l => !l).length;
  if (blanks > text * 0.45) lines = lines.filter(Boolean);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// OCR text -> section markup
export function smartMarkup(text) {
  const lines = text.split("\n");
  const out = []; let v = 0;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { out.push(""); continue; }
    if (/^(chorus|coro|refr[aã]o|कोरस|को0)\s*[:.-]?\s*$/i.test(l)) { out.push("", "[Chorus]"); continue; }
    const m = l.match(/^\(?([0-9१-९])\s*[).।.-]\s*(.+)$/) || l.match(/^([lLI|])\s*[.)]\s*([ऀ-ॿ].+)$/);   // OCR often reads "1." as "L." / "l."
    if (m) { v++; out.push("", `[Verse ${v}]`, m[2]); continue; }
    out.push(l);
  }
  let txt = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!/^\[/.test(txt)) txt = (v ? "[Chorus]\n" : "[Verse 1]\n") + txt;
  return txt;
}
