import test from 'node:test';
import assert from 'node:assert/strict';
import { ocrDocument } from '../server/ocr.mjs';
import { harness, image, scannedPdf, textPdf, example } from './helpers.mjs';
import { groundExtraction, classifyPage } from '../server/extraction.mjs';
test('real local Tesseract reads PNG, JPG and two-page scanned PDF with page confidence', { timeout: 60000 }, async () => {
  const h = harness();
  try {
    const lines = ['BUSINESS PERMIT APPLICATION', 'Business name: TEST KALABASA SHOP', 'Owner name: TEST OWNER', 'Business address: 123 TEST STREET'];
    const png = image(lines), jpeg = image(lines, 'image/jpeg');
    for (const [buffer, pages] of [[png, 1], [jpeg, 1], [scannedPdf(jpeg, 2), 2]]) {
      const result = await ocrDocument(buffer, h.cfg); assert.equal(result.pages.length, pages);
      for (const [i, p] of result.pages.entries()) {
        assert.equal(p.page, i + 1); assert.match(p.text, /TEST KALABASA SHOP/); assert.ok(p.confidence > 0.65); assert.equal(p.unreliable, false); assert.ok(p.words[0].bbox.length === 4); assert.ok(p.image.length > 0);
      }
    }
  } finally { h.cleanup(); }
});
test('blank scans, unsupported formats, unreadable PDFs and page limits are handled', { timeout: 30000 }, async () => {
  const h = harness();
  try {
    const sharp = (await import('sharp')).default;
    const blank = await sharp({ create: { width: 600, height: 600, channels: 3, background: 'white' } }).png().toBuffer();
    const result = await ocrDocument(blank, h.cfg); assert.equal(result.pages[0].unreliable, true); assert.equal(result.pages[0].confidence, 0);
    await assert.rejects(ocrDocument(Buffer.from('not a supported document'), h.cfg), /UNSUPPORTED_FORMAT/);
    await assert.rejects(ocrDocument(Buffer.from('%PDF-1.4\ncorrupted'), h.cfg));
    await assert.rejects(ocrDocument(scannedPdf(image(['test'], 'image/jpeg'), 2), { ...h.cfg, maxPages: 1 }), /PAGE_LIMIT/);
    await assert.rejects(ocrDocument(image(['OCR test']), { ...h.cfg, tesseract: 'nonexistent-tesseract-executable' }), /OCR_UNAVAILABLE/);
  } finally { h.cleanup(); }
});
test('PDF.js reads embedded text without Tesseract and preserves exact table fields and numbers', async () => {
  const h = harness();
  try {
    const lines = ['BARANGAY BUSINESS CLEARANCE', 'Business name: TEST KALABASA SHOP', 'Business address: 54 MacArthur Highway', 'Date issued: October 8, 2026', 'Valid until: April 8, 2027'];
    const result = await ocrDocument(textPdf(lines), { ...h.cfg, tesseract: 'nonexistent-tesseract-executable' });
    const p = result.pages[0];
    assert.equal(p.engine, 'pdfjs-text'); assert.equal(p.textSource, 'pdf_text'); assert.equal(p.confidence, null); assert.equal(p.unreliable, false);
    assert.ok(p.text.includes('54 MacArthur Highway')); assert.ok(p.text.includes('October 8, 2026')); assert.ok(p.text.includes('April 8, 2027'));
    const ex = groundExtraction({ documentType: 'barangay_clearance', typeQuote: lines[0], fields: { business_address: { value: '54 MacArthur Highway', quote: lines[2] } } }, p, example);
    assert.equal(ex.fields.business_address.verification, 'grounded_in_pdf_text'); assert.equal(ex.fields.business_address.page, 1); assert.equal(ex.fields.business_address.confidence, null);
    const checklist = { ...p, text: 'SECTION C - REQUIREMENTS ATTACHED (check all that apply)\nCertificate of business name registration\nBarangay business clearance' };
    assert.equal(classifyPage(checklist, example).classificationVerified, false);
  } finally { h.cleanup(); }
});
