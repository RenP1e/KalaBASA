import test from 'node:test';
import assert from 'node:assert/strict';
import { document, example, samplePage } from './helpers.mjs';
import { validateCompliance } from '../server/rules.mjs';
import { groundExtraction, normalizeValue } from '../server/extraction.mjs';
import { validatePolicy } from '../server/policy.mjs';
const policy = { ...example, productionReady: true, rules: example.rules.filter(r => r.kind !== 'manual') };
const complete = () => ['application_form', 'business_registration', 'barangay_clearance'].map(t => document(t));
const assess = (docs, p = policy, type = 'new') => validateCompliance(docs, p, type, '2026-11-03');
test('complete evidence produces no rule findings and never an approval', () => {
  const result = assess(complete()); assert.deepEqual(result.findings, []); assert.equal(result.decision, null); assert.equal(result.humanReviewRequired, true);
});
test('missing documents are deterministic and new/renewal requirements differ', () => {
  const docs = complete().filter(d => d.documentType !== 'barangay_clearance');
  const result = assess(docs); assert.ok(result.missingDocuments.includes('Barangay clearance'));
  assert.equal(result.findings.find(f => f.ruleId === 'required-new').verificationStatus, 'confirmed_rule_violation');
  assert.ok(assess(complete(), policy, 'renewal').missingDocuments.includes('Previous permit'));
});
test('incomplete information stays unavailable rather than fabricated', () => {
  const docs = complete(); docs[0] = document('application_form', { owner_name: null });
  const finding = assess(docs).findings.find(f => f.ruleId === 'form-fields');
  assert.equal(finding.category, 'incomplete_information'); assert.equal(finding.verificationStatus, 'unverified'); assert.equal(finding.a.page, null);
});
test('cross-document names, addresses and registration conflicts retain both sources', () => {
  const docs = complete(); docs[0] = document('application_form', { business_name: 'DIFFERENT SHOP', business_address: '456 OTHER STREET', registration_number: 'REG-99999' });
  const conflicts = assess(docs).findings.filter(f => f.category === 'inconsistency'); assert.equal(conflicts.length, 3);
  assert.equal(new Set(conflicts.map(f => f.ruleId)).size, 3);
  for (const f of conflicts) { assert.equal(f.verificationStatus, 'potential_inconsistency'); assert.ok(f.evidence.length >= 2); assert.equal(f.a.page, 1); assert.ok(f.a.quote); assert.ok(f.ruleId); }
});
test('invalid dates and identifiers are violations; ambiguous dates need review', () => {
  const docs = complete(); docs[1] = document('business_registration', { registration_number: '@@@', expiry_date: '2025-01-01' });
  docs[2] = document('barangay_clearance', { issue_date: '2024-10-01' });
  const result = assess(docs); assert.ok(result.findings.some(f => f.category === 'invalid_format')); assert.equal(result.findings.filter(f => f.category === 'invalid_date').length, 2);
  for (const date of ['01/02/2026', '2026-02-30', 'n/a']) assert.equal(normalizeValue(date, 'date'), null);
  assert.equal(normalizeValue('3 November 2026', 'date'), '2026-11-03');
});
test('unsupported model values and wrong document classifications cannot satisfy requirements', () => {
  const page = samplePage();
  const result = groundExtraction({ documentType: 'business_registration', typeQuote: 'invented certificate', fields: { business_name: { value: 'INVENTED SHOP', quote: 'Business name: TEST KALABASA SHOP' } } }, page, policy);
  assert.equal(result.fields.business_name, null); assert.ok(result.rejected.includes('business_name')); assert.equal(result.documentType, 'application_form');
  const ambiguous = groundExtraction({ documentType: 'business_registration', typeQuote: 'certificate', fields: {} }, { ...page, text: 'This is a certificate' }, policy);
  assert.equal(ambiguous.classificationVerified, false);
});
test('low confidence OCR cannot create a confirmed rule violation from unreliable fields', () => {
  const docs = complete(); docs[1].classificationVerified = false; docs[1].pages[0].unreliable = true;
  Object.values(docs[1].fields).flat().forEach(f => { f.verification = 'unverified'; });
  const result = assess(docs); assert.ok(result.findings.some(f => f.ruleId === 'system-ocr-quality'));
  assert.equal(result.findings.find(f => f.ruleId === 'required-new').verificationStatus, 'unverified');
});
test('configuration validates references and rejects executable or unbounded patterns', () => {
  assert.equal(validatePolicy(example), example);
  const bad = structuredClone(example); bad.rules.find(r => r.kind === 'format').pattern = '(a+)+'; assert.throws(() => validatePolicy(bad));
  const unknown = structuredClone(example); unknown.rules[0].documentTypes.push('unknown_type'); assert.throws(() => validatePolicy(unknown));
  const disabled = structuredClone(policy); disabled.rules.find(r => r.id === 'required-new').enabled = false;
  assert.deepEqual(assess([], disabled).missingDocuments, []);
});
test('unrecognized uploaded documents are unverified rather than declared missing', () => {
  const docs = complete(); docs[1].classificationVerified = false; docs[1].documentType = 'unknown';
  const result = assess(docs);
  assert.equal(result.missingDocuments.includes('Business registration'), false);
  assert.equal(result.findings.find(f => f.ruleId === 'required-new').verificationStatus, 'unverified');
});
