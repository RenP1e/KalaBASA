import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { config } from '../server/config.mjs';
import { Engine } from '../server/engine.mjs';
import { harness, example, applicant, samplePage, image, scannedPdf } from '../test/helpers.mjs';
const local = config(), h = harness(), started = performance.now();
try {
  const cfg = { ...h.cfg, ollama: local.ollama, model: local.model, tesseract: local.tesseract, modelTimeout: local.modelTimeout };
  const engine = new Engine(h.store, cfg);
  const files = ['application_form', 'business_registration', 'barangay_clearance'].map((type, i) => {
    const jpeg = image(samplePage(type).text.split('\n'), 'image/jpeg');
    return { originalname: `${type}${i === 0 ? '.pdf' : '.jpg'}`, mimetype: i === 0 ? 'application/pdf' : 'image/jpeg', buffer: i === 0 ? scannedPdf(jpeg) : jpeg };
  });
  const job = engine.create(applicant, files, example, 'new');
  console.log(`Running real Tesseract + ${cfg.model} on three synthetic documents (CPU only).`);
  await engine.pending;
  const result = h.store.get('jobs', job.id);
  assert.equal(result.decision, null); assert.equal(result.transmissionState, 'local_only');
  assert.ok(result.model?.digest, 'The installed model must successfully respond.');
  assert.equal(result.documents.length, 3);
  for (const d of result.documents) {
    assert.equal(d.error, undefined, `${d.file} OCR failed`);
    assert.ok(d.pages[0].text.length > 100);
    assert.equal(d.pages[0].extractionError, undefined, `${d.file} extraction failed`);
    assert.equal(d.fields.business_name?.[0]?.value, 'TEST KALABASA SHOP');
    assert.equal(d.fields.identification_number?.length || 0, 0);
    for (const field of Object.values(d.fields).flat()) assert.ok(field.quote && field.page === 1);
  }
  const report = { synthetic: true, runAt: new Date().toISOString(), seconds: Math.round((performance.now() - started) / 1000), model: result.model, state: result.state, decision: result.decision, transmissionState: result.transmissionState,
    documents: result.documents.map(d => ({ file: d.file, type: d.documentType, classificationVerified: d.classificationVerified, confidence: d.pages[0].confidence, fields: d.fields })),
    findings: result.findings.map(f => ({ category: f.category, ruleId: f.ruleId, verificationStatus: f.verificationStatus, description: f.why })) };
  await mkdir('test-output', { recursive: true }); await writeFile('test-output/live-assessment.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, seconds: report.seconds, model: result.model.name, documents: report.documents.map(d => ({ file: d.file, type: d.type, confidence: d.confidence, fields: Object.keys(d.fields).length })), findings: report.findings.length, decision: null }));
} finally { h.cleanup(); }
