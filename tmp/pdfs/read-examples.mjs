import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { ocrDocument } from '../../server/ocr.mjs';
import { config } from '../../server/config.mjs';
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const names = ['application_form', 'barangay_clearance', 'community_tax_certificate', 'dti_certificate', 'lease_contract'];
const cfg = config();
await mkdir('tmp/pdfs/previews', { recursive: true });
for (const name of names) {
  const buffer = await readFile(`C:/Users/MSI/Downloads/${name}.pdf`);
  const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, disableFontFace: true });
  const pdf = await task.promise;
  console.log(`DOCUMENT: ${name}.pdf | PAGES: ${pdf.numPages}`);
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n), content = await page.getTextContent();
    console.log(`PAGE ${n} EMBEDDED TEXT:\n${content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('')}`);
  }
  await task.destroy();
  const ocr = await ocrDocument(buffer, cfg);
  for (const page of ocr.pages) {
    console.log(`PAGE ${page.page} OCR CONFIDENCE: ${page.confidence.toFixed(3)} | UNRELIABLE: ${page.unreliable}\n${page.text}`);
    await writeFile(`tmp/pdfs/previews/${name}-${page.page}.png`, page.image);
  }
}
