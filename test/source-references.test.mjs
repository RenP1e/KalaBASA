import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationView } from '../server/engine.mjs';
import { document, example, applicant } from './helpers.mjs';
import { validateCompliance } from '../server/rules.mjs';

function view(doc, policy = example) {
  return applicationView({ id: 'sample-job', ref: 'sample-ref', applicant, documents: [doc], policy, applicationType: 'new', createdAt: '2026-11-04T00:00:00Z', state: 'manual_review_required', ...validateCompliance([doc], policy, 'new', '2026-11-04') });
}
test('extracted fields retain authenticated page links; omitted unique references can be recovered without changing saved evidence', () => {
  const doc = document('application_form');
  doc.fields.business_name[0].page = null;
  const output = view(doc);
  const field = output.analysis.documents[0].fields.find(f => f.key === 'business_name');
  assert.equal(field.page, 1); assert.equal(field.sourceStatus, 'located');
  assert.equal(field.documentId, doc.id); assert.equal(field.sourceUrl, `/api/assessments/sample-job/documents/${doc.id}/pages/1`);
  assert.equal(doc.fields.business_name[0].page, null, 'response repair does not rewrite saved assessment evidence');
});
test('ambiguous page references remain document-level; absent and nonapplicable fields do not acquire fake pages', () => {
  const doc = document('application_form', { business_activity: null, issue_date: null });
  doc.fields.business_name[0].page = null; doc.pages.push({ ...doc.pages[0], page: 2 });
  const policy = structuredClone(example);
  policy.documentTypes.application_form.extractFields = ['owner_name', 'business_name', 'business_address', 'business_activity', 'issue_date'];
  const fields = view(doc, policy).analysis.documents[0].fields;
  const ambiguous = fields.find(f => f.key === 'business_name');
  assert.equal(ambiguous.page, null); assert.equal(ambiguous.sourceUrl, null); assert.ok(ambiguous.documentUrl);
  const required = fields.find(f => f.key === 'business_activity'); assert.equal(required.required, true); assert.equal(required.flagged, true); assert.equal(required.page, null); assert.equal(required.value, null);
  const optional = fields.find(f => f.key === 'issue_date'); assert.equal(optional.required, false); assert.equal(optional.flagged, false); assert.equal(optional.sourceStatus, 'not_extracted');
  assert.equal(fields.some(f => f.key === 'identification_number'), false, 'irrelevant empty fields are not shown');
});
test('required fields are retained even when excluded from optional extraction settings; checklist checks have explicit provenance', () => {
  const doc = document('application_form', { business_activity: null });
  const policy = structuredClone(example); policy.documentTypes.application_form.extractFields = ['owner_name'];
  const output = view(doc, policy);
  assert.ok(output.analysis.documents[0].fields.some(f => f.key === 'business_activity' && f.required));
  const checklist = output.findings.find(f => f.category === 'manual_verification');
  assert.equal(checklist.a.sourceKind, 'checklist'); assert.equal(checklist.a.sourceUrl, null); assert.equal(checklist.a.page, null);
  assert.equal(checklist.a.meta, 'LGU checklist · no document page');
});
