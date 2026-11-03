import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { example, samplePage, image, scannedPdf } from '../test/helpers.mjs';
await mkdir('test-output/samples', { recursive: true });
for (const type of ['application_form', 'business_registration', 'barangay_clearance']) {
  const p = samplePage(type);
  await writeFile(`test-output/samples/${type}.png`, image(p.text.split('\n')));
}
await writeFile('test-output/samples/conflicting-registration.jpg', image(samplePage('business_registration', { business_name: 'DIFFERENT TEST SHOP', registration_number: 'REG-99999' }).text.split('\n'), 'image/jpeg'));
await writeFile('test-output/samples/incomplete-form.png', image(samplePage('application_form', { owner_name: null, business_address: null }).text.split('\n')));
await writeFile('test-output/samples/scanned-application.pdf', scannedPdf(image(samplePage().text.split('\n'), 'image/jpeg'), 2));
await writeFile('test-output/samples/unreadable.pdf', Buffer.from('%PDF-1.4\ncorrupted synthetic fixture'));
await writeFile('test-output/samples/blank.png', await sharp({ create: { width: 600, height: 600, channels: 3, background: 'white' } }).png().toBuffer());
await writeFile('test-output/samples/unsupported.txt', 'Unsupported synthetic document');
console.log('Synthetic documents generated in test-output/samples. None are valid permit documents.');
