import test from 'node:test';
import assert from 'node:assert/strict';
import { ocrDocument } from '../server/ocr.mjs';
import { harness, image, scannedPdf } from './helpers.mjs';
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
