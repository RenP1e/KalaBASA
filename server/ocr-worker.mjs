import { ocrLocalDocument } from './ocr.mjs';
process.once('message', async message => {
  try {
    const result = await ocrLocalDocument(Buffer.from(message.data, 'base64'), message.config);
    for (const p of result.pages) if (p.image) p.image = p.image.toString('base64');
    process.send(result);
  } catch (e) {
    const allowed = ['UNSUPPORTED_FORMAT', 'PAGE_LIMIT', 'OCR_UNAVAILABLE', 'OCR_TIMEOUT', 'OCR_OUTPUT_LIMIT'];
    process.send({ error: allowed.includes(e.message) ? e.message : 'OCR_UNREADABLE' });
  }
});
