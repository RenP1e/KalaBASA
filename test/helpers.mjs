import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { config } from '../server/config.mjs';
import { Storage } from '../server/storage.mjs';
import { groundExtraction } from '../server/extraction.mjs';
export const example = JSON.parse(readFileSync(new URL('../config/requirements.example.json', import.meta.url)));
export function harness() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kalabasa-test-')), key = randomBytes(32);
  const cfg = config({ KB_MASTER_KEY: key.toString('base64'), KB_DATA_DIR: dir, KB_MODEL: 'qwen2.5:3b', KB_TESSERACT: process.platform === 'win32' ? 'C:/Program Files/Tesseract-OCR/tesseract.exe' : 'tesseract' });
  const store = new Storage(dir, key);
  return { store, cfg, cleanup() { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
export const applicant = { id: 'applicant-1', email: 'sample@example.test', name: 'Synthetic Applicant', role: 'applicant', access: 'consumer', lguId: 'example-lgu' };
export function image(lines, type = 'image/png') {
  const canvas = createCanvas(1600, 1600), c = canvas.getContext('2d');
  c.fillStyle = 'white'; c.fillRect(0, 0, 1600, 1600); c.fillStyle = 'black'; c.font = '34px Arial';
  c.fillText('SYNTHETIC TEST DOCUMENT - NOT VALID FOR SUBMISSION', 50, 65);
  lines.forEach((line, i) => c.fillText(line, 60, 160 + i * 70));
  return canvas.toBuffer(type);
}
export function samplePage(type = 'application_form', changes = {}) {
  const heading = example.documentTypes[type].markers[0];
  const values = { owner_name: 'TEST OWNER', business_name: 'TEST KALABASA SHOP', business_address: '123 TEST STREET', business_activity: 'RETAIL', registration_number: 'REG-12345', issue_date: '2026-10-01', expiry_date: '2027-10-01', identification_number: null, ...changes };
  const text = [heading, ...Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) => `${example.fields[k].label}: ${v}`)].join('\n');
  return { page: 1, text, confidence: 0.96, unreliable: false, words: [], values, type };
}
export const stubExtractor = {
  async available() { return { name: 'test-grounded-extractor', digest: 'synthetic' }; },
  async extract(page, policy) {
    const fields = Object.fromEntries(Object.keys(policy.fields).map(k => [k, page.values?.[k] ? { value: page.values[k], quote: `${policy.fields[k].label}: ${page.values[k]}` } : null]));
    return groundExtraction({ documentType: page.type, typeQuote: policy.documentTypes[page.type].markers[0], fields }, page, policy);
  },
};
export function document(type, changes) {
  const page = samplePage(type, changes), ex = groundExtraction({ documentType: type, typeQuote: example.documentTypes[type].markers[0], fields: Object.fromEntries(Object.entries(page.values).map(([key, value]) => [key, value ? { value, quote: `${example.fields[key].label}: ${value}` } : null])) }, page, example);
  return { id: type, file: `${type}.png`, documentType: type, classificationVerified: true, pages: [{ ...page, ...ex }], fields: Object.fromEntries(Object.entries(ex.fields).map(([k, v]) => [k, v ? [v] : []])) };
}
// A scanned PDF fixture: a JPEG image on each page, no embedded text layer.
export function scannedPdf(jpeg, count = 1) {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${count} /Kids [${Array.from({ length: count }, (_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`];
  for (let i = 0; i < count; i++) {
    const base = 3 + i * 3, command = 'q 600 0 0 600 0 0 cm /Im0 Do Q';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 600] /Resources << /XObject << /Im0 ${base + 2} 0 R >> >> /Contents ${base + 1} 0 R >>`);
    objects.push(`<< /Length ${command.length} >>\nstream\n${command}\nendstream`);
    objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1600 /Height 1600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')]));
  }
  const parts = [Buffer.from('%PDF-1.4\n')], offsets = [0]; let length = parts[0].length;
  for (let i = 1; i < objects.length; i++) { offsets.push(length); const b = Buffer.concat([Buffer.from(`${i} 0 obj\n`), Buffer.from(objects[i]), Buffer.from('\nendobj\n')]); parts.push(b); length += b.length; }
  parts.push(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(parts);
}
