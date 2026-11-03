import test from 'node:test';
import assert from 'node:assert/strict';
import { createUser, login, session, changePassword } from '../server/auth.mjs';
import { OllamaExtractor } from '../server/extraction.mjs';
import { config } from '../server/config.mjs';
import { harness, example, samplePage } from './helpers.mjs';
test('password changes verify the current credential, revoke other sessions and preserve the current session', () => {
  const h = harness();
  try {
    createUser(h.store, { email: 'account@example.test', name: 'Synthetic User', lguId: 'example-lgu', role: 'applicant', password: 'synthetic-old-password' });
    const one = login(h.store, 'account@example.test', 'synthetic-old-password'), two = login(h.store, 'account@example.test', 'synthetic-old-password');
    const request = token => ({ headers: { cookie: `kb_session=${token}` } });
    const auth = session(h.store, request(one.token));
    assert.throws(() => changePassword(h.store, auth, 'incorrect', 'synthetic-new-password'));
    changePassword(h.store, auth, 'synthetic-old-password', 'synthetic-new-password');
    assert.equal(session(h.store, request(two.token)), null); assert.ok(session(h.store, request(one.token)));
    assert.equal(login(h.store, 'account@example.test', 'synthetic-old-password'), null); assert.ok(login(h.store, 'account@example.test', 'synthetic-new-password'));
  } finally { h.cleanup(); }
});
test('extraction rejects cloud routing, invalid schemas, truncation and absent local models', async () => {
  const h = harness();
  try {
    for (const url of ['https://api.example.test', 'http://192.168.0.2:11434', 'http://localhost:11434', 'http://127.0.0.1:11434/other']) assert.throws(() => config({ KB_MASTER_KEY: h.cfg.key.toString('base64'), KB_OLLAMA_URL: url }));
    assert.throws(() => config({ KB_MASTER_KEY: h.cfg.key.toString('base64'), KB_MODEL: 'model:cloud' }));
    const requests = [];
    const extractor = new OllamaExtractor(h.cfg, async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ message: { content: '{"decision":"approved"}' } }) };
    });
    await assert.rejects(extractor.extract(samplePage(), example), /INVALID_EXTRACTION/);
    const body = JSON.parse(requests[0].options.body); assert.equal(body.options.num_gpu, 0); assert.equal(body.stream, false); assert.equal(body.format.additionalProperties, false); assert.ok(requests[0].url.startsWith('http://127.0.0.1:'));
    const missing = new OllamaExtractor(h.cfg, async () => ({ ok: true, json: async () => ({ models: [] }) })); await assert.rejects(missing.available());
    const remote = new OllamaExtractor(h.cfg, async () => ({ ok: true, json: async () => ({ models: [{ name: h.cfg.model, size: 10, remote_host: 'https://cloud.example.test' }] }) })); await assert.rejects(remote.available());
    const truncated = new OllamaExtractor(h.cfg, async () => ({ ok: true, json: async () => ({ done_reason: 'length' }) })); await assert.rejects(truncated.extract(samplePage(), example), /INVALID_EXTRACTION/);
  } finally { h.cleanup(); }
});
test('model values get source-built quotes; invented values are discarded and disallowed field types are excluded', async () => {
  const h = harness();
  try {
    const policy = structuredClone(example);
    policy.documentTypes.application_form.extractFields = ['business_name', 'owner_name'];
    const page = { ...samplePage(), textSource: 'pdf_text', confidence: null };
    let request;
    const extractor = new OllamaExtractor(h.cfg, async (url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ message: { content: JSON.stringify({ documentType: 'application_form', fields: { business_name: 'TESTKALABASA SHOP', owner_name: 'INVENTED PERSON' } }) } }) };
    });
    const result = await extractor.extract(page, policy);
    assert.equal(result.fields.business_name.value, 'TEST KALABASA SHOP');
    assert.ok(result.fields.business_name.quote.includes('Business name: TEST KALABASA SHOP'));
    assert.equal(result.fields.business_name.verification, 'grounded_in_pdf_text');
    assert.equal(result.fields.owner_name, null); assert.ok(result.rejected.includes('owner_name'));
    assert.equal(Object.hasOwn(request.format.properties.fields.properties, 'registration_number'), false);
  } finally { h.cleanup(); }
});
test('configured source sections prevent a landlord residence from becoming a business address', async () => {
  const h = harness();
  try {
    const policy = structuredClone(example);
    policy.documentTypes.lease_contract = { label: 'Lease', markers: ['contract of lease'], extractFields: ['business_address'], fieldScopes: { business_address: { after: '1. PREMISES.', before: '2. TERM.' } } };
    const page = { page: 1, textSource: 'pdf_text', confidence: null, unreliable: false, text: 'CONTRACT OF LEASE\nLandlord residence: 15 TEST ROAD\n1. PREMISES. Commercial space located at 54 TEST HIGHWAY\n2. TERM. Three years.' };
    let value = '15 TEST ROAD', calls = 0;
    const extractor = new OllamaExtractor(h.cfg, async () => { calls++; return { ok: true, json: async () => ({ message: { content: JSON.stringify({ documentType: 'lease_contract', fields: { business_address: value } }) } }) }; });
    assert.equal((await extractor.extract(page, policy)).fields.business_address, null);
    value = '54 TEST HIGHWAY';
    assert.equal((await extractor.extract(page, policy)).fields.business_address.value, value);
    const before = calls;
    const continuation = await extractor.extract({ ...page, text: 'CONTRACT OF LEASE\nNotarial acknowledgment and witness signatures only.' }, policy);
    assert.equal(calls, before); assert.equal(continuation.fields.business_address, null);
  } finally { h.cleanup(); }
});
