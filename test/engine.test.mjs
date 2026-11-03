import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Engine } from '../server/engine.mjs';
import { savePolicy, activePolicy } from '../server/policy.mjs';
import { harness, example, applicant, samplePage, stubExtractor, image } from './helpers.mjs';

test('offline pipeline persists originals, findings and policy snapshot; no automatic decisions', async () => {
  const h = harness();
  try {
    savePolicy(h.store, example, 'test-admin'); const p = activePolicy(h.store, example.lguId);
    const pages = [samplePage('application_form'), samplePage('business_registration'), samplePage('barangay_clearance')]; let n = 0;
    const engine = new Engine(h.store, h.cfg, { ocr: async () => ({ type: 'image/png', pages: [pages[n++]] }), extractor: stubExtractor });
    const job = engine.create(applicant, pages.map((p, i) => ({ originalname: `sample-${i}.png`, mimetype: 'image/png', buffer: image(p.text.split('\n')) })), p, 'new');
    savePolicy(h.store, { ...example, version: 'next-version' }, 'test-admin');
    await engine.pending;
    const result = h.store.get('jobs', job.id);
    assert.equal(result.policy.version, 'example-1'); assert.equal(result.state, 'manual_review_required'); assert.equal(result.decision, null); assert.equal(result.transmissionState, 'local_only');
    assert.equal(result.documents.length, 3); assert.ok(result.findings.some(f => f.ruleId === 'authenticity')); assert.equal(result.documents[0].fields.identification_number?.length || 0, 0);
    const bytes = Buffer.concat([readFileSync(path.join(h.cfg.dataDir, 'kalabasa.sqlite')), readFileSync(path.join(h.cfg.dataDir, 'kalabasa.sqlite-wal'))]);
    assert.equal(bytes.includes(Buffer.from('TEST KALABASA SHOP')), false); assert.equal(bytes.includes(Buffer.from('Synthetic Applicant')), false);
    assert.ok(h.store.auditRecords().some(a => a.action === 'assessment_completed'));
  } finally { h.cleanup(); }
});
test('service interruption preserves OCR and marks unverified extraction without inventing fields', async () => {
  const h = harness();
  try {
    const extractor = { available: stubExtractor.available, async extract() { throw new Error('connection interrupted'); } };
    const engine = new Engine(h.store, h.cfg, { extractor, ocr: async () => ({ type: 'image/png', pages: [samplePage()] }) });
    const job = engine.create(applicant, [{ originalname: 'form.png', mimetype: 'image/png', buffer: image(['Business permit application']) }], example, 'new');
    await engine.pending; const result = h.store.get('jobs', job.id);
    assert.equal(result.state, 'local_ai_unavailable'); assert.deepEqual(result.documents[0].fields, {}); assert.ok(result.documents[0].pages[0].text); assert.equal(result.decision, null);
  } finally { h.cleanup(); }
});
test('startup recovery reprocesses encrypted originals with pinned requirements', async () => {
  const h = harness();
  try {
    const stopped = new Engine(h.store, h.cfg); stopped.stopped = true;
    const job = stopped.create(applicant, [{ originalname: 'form.png', mimetype: 'image/png', buffer: image(['Business permit application']) }], example, 'new');
    stopped.update(job.id, { state: 'identifying_information' });
    const engine = new Engine(h.store, h.cfg, { extractor: stubExtractor, ocr: async () => ({ type: 'image/png', pages: [samplePage()] }) });
    engine.recover(); await engine.pending;
    assert.equal(h.store.get('jobs', job.id).progress, 100); assert.equal(h.store.get('jobs', job.id).policy.version, example.version);
  } finally { h.cleanup(); }
});
test('configuration versions are immutable and audit modification is detected', () => {
  const h = harness();
  try {
    savePolicy(h.store, example, 'test-admin'); assert.throws(() => savePolicy(h.store, example, 'test-admin'));
    h.store.db.prepare('UPDATE audit SET hash=? WHERE seq=1').run('tampered'); assert.throws(() => h.store.verifyAudit());
  } finally { h.cleanup(); }
});
