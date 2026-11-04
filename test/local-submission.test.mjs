import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { createUser } from '../server/auth.mjs';
import { savePolicy } from '../server/policy.mjs';
import { Storage } from '../server/storage.mjs';
import { harness, example, samplePage, image, textPdf, stubExtractor } from './helpers.mjs';

async function setup(mode = 'local') {
  const h = harness(); h.cfg.submissionMode = mode;
  savePolicy(h.store, example, 'test-admin');
  createUser(h.store, { email: 'admin@example.test', name: 'Test LGU Administrator', role: 'admin', lguId: example.lguId, password: 'synthetic-password-123' });
  createUser(h.store, { email: 'unrelated@example.test', name: 'Other LGU Reviewer', role: 'reviewer', lguId: 'other-lgu', password: 'synthetic-password-123' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { app, engine } = createApp(h.store, h.cfg, { extractor: stubExtractor, ocr: async () => { await gate; return { type: 'application/pdf', pages: [{ ...samplePage(), image: image(['Synthetic source page']) }] }; } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); h.cfg.port = server.address().port;
  const base = `http://127.0.0.1:${h.cfg.port}`;
  const call = (url, session = {}, options = {}) => fetch(base + url, { ...options, headers: { ...session, ...options.headers } });
  const post = (url, session, data) => call(url, session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
  async function signIn(email) {
    const r = await post('/api/auth/login', {}, { email, password: 'synthetic-password-123' }); assert.equal(r.status, 200);
    const data = await r.json(); return { cookie: r.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': data.csrf };
  }
  const admin = await signIn('admin@example.test');
  for (const [email, role] of [['applicant@example.test', 'applicant'], ['another@example.test', 'applicant'], ['reviewer@example.test', 'reviewer']]) {
    const r = await post('/api/admin/users', admin, { email, name: `Test ${role}`, role, lguId: example.lguId, password: 'synthetic-password-123' }); assert.equal(r.status, 201);
  }
  return { ...h, admin, engine, release, call, post, signIn, async close() { release(); await engine.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); h.cleanup(); } };
}
test('applicant submits local PDFs, LGU reviewer opens originals and records a decision; draft and cross-LGU access stay private', async () => {
  const h = await setup();
  try {
    const applicant = await h.signIn('applicant@example.test'), other = await h.signIn('another@example.test'), reviewer = await h.signIn('reviewer@example.test'), unrelated = await h.signIn('unrelated@example.test');
    const accounts = await (await h.call('/api/admin/users', h.admin)).json();
    assert.equal(accounts.length, 4); assert.equal(accounts.some(u => u.role === 'applicant'), true); assert.equal(accounts.some(u => u.role === 'reviewer'), true);
    assert.equal(accounts.some(u => Object.hasOwn(u, 'hash') || Object.hasOwn(u, 'password') || Object.hasOwn(u, 'salt')), false);
    assert.equal((await h.call('/api/admin/users', reviewer)).status, 403);
    const pdf = textPdf(['BUSINESS PERMIT APPLICATION', 'Business name: TEST SHOP', 'Owner name: TEST OWNER']);
    const form = new FormData();
    form.append('files', new Blob([pdf], { type: 'application/pdf' }), 'application.pdf');
    form.append('files', new Blob([pdf], { type: 'application/pdf' }), 'supporting.pdf');
    const uploaded = await h.call('/api/assessments', applicant, { method: 'POST', body: form }); assert.equal(uploaded.status, 202);
    const { id } = await uploaded.json();
    assert.equal((await h.post(`/api/assessments/${id}/submit`, applicant)).status, 409, 'processing must finish before submission');
    assert.equal((await h.call(`/api/assessments/${id}`, reviewer)).status, 404);
    assert.deepEqual(await (await h.call('/api/assessments', reviewer)).json(), []);
    h.release(); await h.engine.pending;
    assert.equal((await h.call(`/api/assessments/${id}`, reviewer)).status, 404, 'completed but unsubmitted draft stays private');
    const submitted = await h.post(`/api/assessments/${id}/submit`, applicant); assert.equal(submitted.status, 201);
    const receipt = await submitted.json(); assert.equal(receipt.channel, 'local'); assert.equal(receipt.transmissionState, 'received_by_lgu'); assert.ok(receipt.receipt);
    const repeated = await h.post(`/api/assessments/${id}/submit`, applicant); assert.equal(repeated.status, 200); assert.equal((await repeated.json()).receipt, receipt.receipt);
    const queue = await (await h.call('/api/assessments', reviewer)).json(); assert.equal(queue.length, 1); assert.equal(queue[0].id, id); assert.equal(queue[0].decision, null); assert.equal(queue[0].submissionReceipt, receipt.receipt);
    const item = await (await h.call(`/api/assessments/${id}`, reviewer)).json(); assert.equal(item.analysis.documents.length, 2); assert.ok(item.findings.length > 0);
    for (const doc of item.analysis.documents) {
      const original = await h.call(doc.sourceUrl, reviewer); assert.equal(original.status, 200); assert.match(original.headers.get('content-type'), /application\/pdf/); assert.deepEqual(Buffer.from(await original.arrayBuffer()), pdf);
      assert.equal((await h.call(doc.sourceUrl, other)).status, 404); assert.equal((await h.call(doc.sourceUrl, unrelated)).status, 404);
    }
    assert.equal((await h.call(`/api/assessments/${id}`, other)).status, 404); assert.equal((await h.call(`/api/assessments/${id}`, unrelated)).status, 404);
    assert.equal((await h.post(`/api/assessments/${id}/retry`, applicant)).status, 409, 'submitted evidence cannot be overwritten');
    assert.equal((await h.post(`/api/assessments/${id}/decisions`, applicant, { type: 'returned', revision: item.revision })).status, 403);
    assert.equal((await h.post(`/api/assessments/${id}/submit`, reviewer)).status, 403);
    const f = item.findings[0];
    const reviewed = await h.post(`/api/assessments/${id}/findings/${f.key}`, reviewer, { status: 'confirmed', revision: item.revision }); assert.equal(reviewed.status, 200);
    const fresh = await reviewed.json();
    assert.equal((await h.post(`/api/assessments/${id}/decisions`, reviewer, { type: 'returned', revision: fresh.revision })).status, 200);
    const outcome = await (await h.call(`/api/assessments/${id}`, applicant)).json(); assert.equal(outcome.decision.type, 'returned'); assert.equal(outcome.decision.by, 'Test reviewer');
    assert.equal(h.store.list('outbox').length, 0, 'same-installation handoff performs no external synchronization');
    assert.equal(h.store.auditRecords().filter(a => a.action === 'application_submitted_locally').length, 1);
    const reopened = new Storage(h.cfg.dataDir, h.cfg.key); assert.equal(reopened.get('jobs', id).submission.receipt, receipt.receipt); reopened.close();
  } finally { await h.close(); }
});
test('explicit remote mode still queues delivery and does not expose local drafts to reviewers', async () => {
  const h = await setup('remote');
  try {
    const applicant = await h.signIn('applicant@example.test'), reviewer = await h.signIn('reviewer@example.test');
    const f = new FormData(); f.append('files', new Blob([textPdf(['Business permit application', 'Test owner and business details for local test'])], { type: 'application/pdf' }), 'sample.pdf');
    const { id } = await (await h.call('/api/assessments', applicant, { method: 'POST', body: f })).json(); h.release(); await h.engine.pending;
    const r = await h.post(`/api/assessments/${id}/submit`, applicant); assert.equal(r.status, 202);
    const result = await r.json(); assert.equal(result.channel, 'remote'); assert.equal(result.transmissionState, 'queued');
    assert.equal(h.store.list('outbox').length, 1); assert.equal((await h.call(`/api/assessments/${id}`, reviewer)).status, 404);
  } finally { await h.close(); }
});
