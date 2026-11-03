import { spawn } from 'node:child_process';
import { fork } from 'node:child_process';
import sharp from 'sharp';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });

export function runTesseract(buffer, cfg, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cfg.tesseract, ['stdin', 'stdout', '-l', cfg.ocrLang, '--psm', '3', 'tsv'], { windowsHide: true, env: { ...process.env, OMP_THREAD_LIMIT: '2' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', size = 0, settled = false;
    const finish = (err, result) => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolve(result); };
    const timer = setTimeout(() => { proc.kill(); finish(new Error('OCR_TIMEOUT')); }, timeout);
    proc.on('error', () => finish(new Error('OCR_UNAVAILABLE')));
    proc.stdout.on('data', data => {
      size += data.length;
      if (size > 4 * 1024 * 1024) { proc.kill(); finish(new Error('OCR_OUTPUT_LIMIT')); }
      else output += data;
    });
    proc.stderr.resume(); // Never log OCR stderr: engines may include document text.
    proc.on('close', code => finish(code === 0 ? null : new Error('OCR_UNREADABLE'), output));
    proc.stdin.on('error', () => {}); proc.stdin.end(buffer);
  });
}
export function parseTSV(tsv) {
  const words = tsv.trim().split(/\r?\n/).slice(1).map(line => {
    const c = line.split('\t');
    return { level: Number(c[0]), line: c.slice(1, 5).join(':'), confidence: Number(c[10]) / 100, text: c.slice(11).join('\t'), bbox: c.slice(6, 10).map(Number) };
  }).filter(w => w.level === 5 && w.text?.trim() && Number.isFinite(w.confidence) && w.confidence >= 0);
  let text = '', previous;
  for (const word of words) {
    if (text) text += previous === word.line ? ' ' : '\n';
    word.start = text.length; text += word.text; word.end = text.length; previous = word.line;
    delete word.level;
  }
  return { text, words, confidence: words.length ? words.reduce((n, w) => n + w.confidence, 0) / words.length : 0 };
}
export function detectType(buffer) {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  return null;
}
export async function ocrLocalDocument(buffer, cfg) {
  const type = detectType(buffer);
  if (!type) throw new Error('UNSUPPORTED_FORMAT');
  const pages = [];
  async function recognize(image, page) {
    // Rotation honours EXIF; bounded pixels and a modest upscale improve small scans.
    const normalized = await sharp(image, { limitInputPixels: 25000000 }).rotate().resize({ width: 2200, height: 3000, fit: 'inside' }).flatten({ background: 'white' }).grayscale().normalize().png().toBuffer();
    const result = parseTSV(await runTesseract(normalized, cfg));
    const unreliable = result.confidence < cfg.minConfidence || result.text.replace(/\s/g, '').length < 20;
    pages.push({ page, ...result, unreliable, engine: 'tesseract', image: normalized });
  }
  if (type === 'application/pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, disableFontFace: true });
    let pdf;
    try {
      pdf = await task.promise;
      if (pdf.numPages > cfg.maxPages) throw new Error('PAGE_LIMIT');
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n), base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 2400 / Math.max(base.width, base.height));
        if (!Number.isFinite(scale) || scale <= 0) throw new Error('OCR_UNREADABLE');
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        await recognize(canvas.toBuffer('image/png'), n);
        page.cleanup();
      }
    } finally { await task.destroy(); }
  } else await recognize(buffer, 1);
  return { type, pages };
}

// Native PDF/image decoding runs out of process. A corrupt scan cannot terminate the API server.
export function ocrDocument(buffer, cfg) {
  return new Promise((resolve, reject) => {
    const child = fork(new URL('./ocr-worker.mjs', import.meta.url), [], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: ['--max-old-space-size=512'] });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer); child.kill();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('OCR_TIMEOUT')), 600000);
    child.on('error', () => finish(new Error('OCR_UNAVAILABLE')));
    child.on('exit', () => finish(new Error('OCR_UNREADABLE')));
    child.on('message', result => {
      if (result.error) return finish(new Error(result.error));
      for (const p of result.pages) if (p.image) p.image = Buffer.from(p.image, 'base64');
      finish(null, result);
    });
    child.send({ data: buffer.toString('base64'), config: { tesseract: cfg.tesseract, ocrLang: cfg.ocrLang, maxPages: cfg.maxPages, minConfidence: cfg.minConfidence } }, error => { if (error) finish(new Error('OCR_UNAVAILABLE')); });
  });
}
