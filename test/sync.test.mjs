import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../server/engine.mjs';
import { Synchronizer, receiveSubmission } from '../server/sync.mjs';
import { savePolicy } from '../server/policy.mjs';
import { harness, example, applicant, image, samplePage, stubExtractor } from './helpers.mjs';
test('interrupted sync retries the same immutable payload and receiver issues one receipt', async () => {
  const sender = harness(), receiver = harness();
  try {
    savePolicy(receiver.store, example, 'admin'); receiver.cfg.inboundLgu = example.lguId;
    const engine = new Engine(sender.store, sender.cfg, { extractor: stubExtractor, ocr: async () => ({ type: 'image/png', pages: [samplePage()] }) });
    const job = engine.create(applicant, [{ originalname: 'sample.png', mimetype: 'image/png', buffer: image(['business permit application']) }], example, 'new'); await engine.pending;
    const config = { ...sender.cfg, syncUrl: 'http://127.0.0.1:4000/api/sync/receive', syncToken: 'synthetic-sync-secret' };
    let calls = 0; const keys = [];
    const sync = new Synchronizer(sender.store, config, async (url, options) => {
      const payload = JSON.parse(options.body); keys.push(payload.idempotencyKey); calls++;
      const ack = receiveSubmission(receiver.store, payload, receiver.cfg);
      if (calls === 1) throw new Error('Response lost after receiver committed');
      return { ok: true, json: async () => ack };
    });
    sync.queue(sender.store.get('jobs', job.id), applicant.id);
    await sync.flush(1000); assert.equal(sender.store.get('jobs', job.id).transmissionState, 'queued'); assert.equal(receiver.store.list('jobs').length, 1);
    // Simulate crash during the next send and recover from persisted state.
    const item = sender.store.list('outbox')[0]; sender.store.put('outbox', item.id, { ...item, state: 'sending' });
    const restarted = new Synchronizer(sender.store, config, sync.fetch);
    await restarted.flush(5000);
    assert.equal(keys[0], keys[1]); assert.equal(receiver.store.list('jobs').length, 1); assert.equal(receiver.store.list('inbox').length, 1);
    assert.equal(sender.store.get('jobs', job.id).transmissionState, 'transmitted'); assert.ok(sender.store.get('jobs', job.id).remoteReceipt);
    assert.equal(receiver.store.list('jobs')[0].decision, null); assert.equal(receiver.store.list('jobs')[0].state, 'uploading');
    const changed = structuredClone(item.payload); changed.assessment.applicationType = 'renewal'; assert.throws(() => receiveSubmission(receiver.store, changed, receiver.cfg), /different data/);
  } finally { sender.cleanup(); receiver.cleanup(); }
});
test('missing connectivity or an invalid acknowledgement never reports successful transmission', async () => {
  const h = harness();
  try {
    const engine = new Engine(h.store, h.cfg, { extractor: stubExtractor, ocr: async () => ({ type: 'image/png', pages: [samplePage()] }) });
    const job = engine.create(applicant, [{ originalname: 'sample.png', mimetype: 'image/png', buffer: image(['business permit application']) }], example, 'new'); await engine.pending;
    const offline = new Synchronizer(h.store, h.cfg); offline.queue(h.store.get('jobs', job.id), applicant.id); await offline.flush();
    assert.equal(h.store.get('jobs', job.id).transmissionState, 'queued');
    const invalid = new Synchronizer(h.store, { ...h.cfg, syncUrl: 'https://lgu.example.test/receive', syncToken: 'test' }, async () => ({ ok: true, json: async () => ({ receipt: 'incorrect' }) }));
    await invalid.flush(); assert.equal(h.store.get('jobs', job.id).transmissionState, 'queued'); assert.equal(h.store.list('outbox')[0].attempts, 1);
  } finally { h.cleanup(); }
});
