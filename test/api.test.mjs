import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { createUser } from '../server/auth.mjs';
import { savePolicy } from '../server/policy.mjs';
import { harness, example, samplePage, image, stubExtractor } from './helpers.mjs';

test('authenticated upload, evidence, QR privacy, RBAC, CSRF, and human decisions', { timeout: 30000 }, async () => {
  const h = harness();
  savePolicy(h.store, example, 'test-admin');
  for (const [email, role] of [['one@example.test', 'applicant'], ['two@example.test', 'applicant'], ['reviewer@example.test', 'reviewer'], ['admin@example.test', 'admin']]) createUser(h.store, { email, role, name: `Synthetic ${role}`, lguId: example.lguId, password: 'synthetic-password-123' });
  const { app, engine } = createApp(h.store, h.cfg, { extractor: stubExtractor, ocr: async () => ({ type: 'image/png', pages: [{ ...samplePage(), image: image(['Synthetic source page']) }] }) });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); h.cfg.port = server.address().port;
  const base = `http://127.0.0.1:${h.cfg.port}`;
  async function signIn(email) {
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'synthetic-password-123' }) });
    assert.equal(res.status, 200); const data = await res.json(); return { cookie: res.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': data.csrf };
  }
  const call = (url, headers, options = {}) => fetch(base + url, { ...options, headers: { ...headers, ...options.headers } });
  try {
    assert.equal((await fetch(base + '/api/assessments')).status, 401);
    for (const url of ['/.env', '/var/kalabasa.sqlite', '/server/config.mjs', '/node_modules/express/package.json']) assert.equal((await fetch(base + url)).status, 404);
    const one = await signIn('one@example.test'), two = await signIn('two@example.test'), reviewer = await signIn('reviewer@example.test'), admin = await signIn('admin@example.test');
    const form = () => { const f = new FormData(); f.append('files', new Blob([image(['Business permit application'])], { type: 'image/png' }), 'form.png'); f.append('applicationType', 'new'); return f; };
    assert.equal((await call('/api/assessments', { cookie: one.cookie }, { method: 'POST', body: form() })).status, 403);
    const bad = new FormData(); bad.append('files', new Blob(['unsupported']), 'sample.txt'); assert.equal((await call('/api/assessments', one, { method: 'POST', body: bad })).status, 415);
    const uploaded = await call('/api/assessments', one, { method: 'POST', body: form() }); assert.equal(uploaded.status, 202); const { id } = await uploaded.json(); await engine.pending;
    const result = await (await call(`/api/assessments/${id}`, one)).json(); assert.equal(result.decision, null); assert.equal(result.analysis.documents[0].fields.find(f => f.key === 'identification_number').value, null);
    assert.equal((await call(`/api/assessments/${id}`, two)).status, 404); assert.equal((await call(`/api/assessments/${id}`, reviewer)).status, 404);
    assert.deepEqual(await (await call('/api/assessments', two)).json(), []);
    const pageUrl = result.analysis.documents[0].sourceUrl + '/pages/1'; assert.equal((await call(pageUrl, one)).status, 200); assert.equal((await call(pageUrl, two)).status, 404);
    const decision = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'approved', revision: result.revision, reason: 'I inspected the original documents.' }) };
    assert.equal((await call(`/api/assessments/${id}/decisions`, one, decision)).status, 403);
    assert.equal((await call('/api/admin/requirements', reviewer, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(example) })).status, 403);
    const qr = await (await call(`/api/assessments/${id}/qr`, one)).json(); assert.match(qr.image, /^data:image\/png;base64,/);
    const verify = await (await fetch(base + qr.value)).json(); const serialized = JSON.stringify(verify); assert.equal(serialized.includes('TEST'), false); assert.equal(serialized.includes('example.test'), false); assert.equal(verify.officialDecision, 'not_recorded');
    const upload2 = await call('/api/assessments', reviewer, { method: 'POST', body: form() }); const j2 = await upload2.json(); await engine.pending;
    let reviewApp = await (await call(`/api/assessments/${j2.id}`, reviewer)).json();
    const decide = type => call(`/api/assessments/${j2.id}/decisions`, reviewer, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, revision: reviewApp.revision, reason: 'Original evidence reviewed by a human.' }) });
    assert.equal((await decide('approved')).status, 409);
    for (const f of reviewApp.findings) {
      const response = await call(`/api/assessments/${j2.id}/findings/${f.key}`, reviewer, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: reviewApp.revision, status: 'dismissed' }) });
      assert.equal(response.status, 200); reviewApp = await response.json();
    }
    assert.equal((await decide('forwarded')).status, 200); reviewApp = await (await call(`/api/assessments/${j2.id}`, reviewer)).json(); assert.equal(reviewApp.decision, null);
    assert.equal((await decide('approved')).status, 200); reviewApp = await (await call(`/api/assessments/${j2.id}`, reviewer)).json(); assert.equal(reviewApp.decision.type, 'approved'); assert.equal(reviewApp.decision.by, 'Synthetic reviewer');
    const audit = await (await call('/api/admin/audit', admin)).json(); assert.ok(audit.some(a => a.action === 'source_page_accessed')); assert.ok(audit.some(a => a.action === 'application_approved'));
    savePolicy(h.store, { ...example, version: 'test-next-policy' }, 'test-admin');
    assert.equal((await call(`/api/assessments/${id}/retry`, one, { method: 'POST' })).status, 202); await engine.pending;
    assert.equal(h.store.get('jobs', id).policy.version, example.version);
    assert.equal((await call(`/api/assessments/${id}/retry`, one, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useCurrentRequirements: true }) })).status, 202); await engine.pending;
    assert.equal(h.store.get('jobs', id).policy.version, 'test-next-policy');
    assert.ok(h.store.list('assessmentHistory').some(j => j.id === id && j.policy.version === example.version));
    assert.equal((await call('/api/auth/logout', one, { method: 'POST' })).status, 200); assert.equal((await call('/api/auth/me', one)).status, 401);
  } finally { await engine.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); h.cleanup(); }
});
