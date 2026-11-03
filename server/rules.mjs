import { canonical, isGrounded } from './extraction.mjs';
const source = (doc, field, label = 'Document') => ({
  documentId: doc?.id || null, file: doc?.file || 'Application document checklist', page: field?.page || null,
  meta: field?.page ? `Page ${field.page} · ${label}` : doc ? 'Document-level check · no value located' : 'LGU checklist · no document page', label,
  segs: [{ t: field?.raw || field?.value || (doc ? 'No extracted value located; inspect the original document.' : 'Application-level verification; no quoted document value.'), hl: !!(field?.raw || field?.value) }],
  quote: field?.quote || null, sub: field?.verification || 'Not automatically verified',
});
export function validateCompliance(documents, policy, applicationType, assessmentDate) {
  const findings = [], missingDocuments = [];
  function add(ruleId, category, verificationStatus, description, doc, field, otherDoc, otherField) {
    const a = source(doc, field, field?.label), b = otherDoc ? source(otherDoc, otherField, field?.label) : a;
    findings.push({ key: `${ruleId}-${findings.length + 1}`, category, verificationStatus, ruleId, title: description, why: description,
      documentId: doc?.id || null, page: field?.page || null, evidence: [a, ...(otherDoc ? [b] : [])], a, b,
      status: 'awaiting', confidence: field?.confidence ?? null,
      tags: [{ t: verificationStatus.replaceAll('_', ' '), tone: verificationStatus === 'confirmed_rule_violation' ? 'warn' : 'info' }, { t: `Rule: ${ruleId}`, tone: 'info' }],
    });
  }
  const usable = isGrounded;
  for (const doc of documents) {
    if (doc.error) add('system-ocr', 'unverifiable', 'unverified', 'Document could not be read; manual review is required.', doc);
    if (!doc.classificationVerified) add('system-classification', 'unverifiable', 'unverified', 'Document type could not be verified automatically.', doc);
    for (const p of doc.pages || []) {
      if (p.unreliable) add('system-ocr-quality', 'unverifiable', 'unverified', 'OCR text is unreliable; inspect the original page.', doc, { page: p.page, raw: p.text.slice(0, 160), confidence: p.confidence });
      if (p.extractionError) add('system-extraction', 'unverifiable', 'unverified', p.extractionError === 'LOCAL_AI_UNAVAILABLE' ? 'Local AI service unavailable; extraction requires retry or manual review.' : 'Structured extraction could not be verified for this page.', doc, { page: p.page });
      if (p.rejected?.length) add('system-grounding', 'unverifiable', 'unverified', `Unsupported extraction discarded: ${p.rejected.join(', ')}.`, doc, { page: p.page });
    }
    for (const [key, values] of Object.entries(doc.fields || {})) {
      const grounded = values.filter(usable);
      if (new Set(grounded.map(f => canonical(f.value))).size > 1) add('system-page-conflict', 'inconsistency', 'potential_inconsistency', `Conflicting ${policy.fields[key].label} values within one document.`, doc, { ...grounded[0], label: policy.fields[key].label }, doc, grounded.find(f => canonical(f.value) !== canonical(grounded[0].value)));
    }
  }
  for (const rule of policy.rules.filter(r => r.enabled && (!r.applicationTypes || r.applicationTypes.includes(applicationType)))) {
    const selected = documents.filter(d => !rule.documentTypes || rule.documentTypes.includes(d.documentType));
    if (rule.kind === 'documents') {
      for (const type of rule.documentTypes) {
        if (!documents.some(d => d.documentType === type && d.classificationVerified)) {
          const label = policy.documentTypes[type].label;
          const uncertain = documents.some(d => !d.classificationVerified);
          if (!uncertain) missingDocuments.push(label);
          add(rule.id, 'missing_document', uncertain ? 'unverified' : 'confirmed_rule_violation', `${label} has not been verified among the uploaded documents.`);
        }
      }
    } else if (rule.kind === 'manual') {
      add(rule.id, 'manual_verification', 'unverified', rule.description || 'This requirement needs an authorized reviewer.');
    } else if (rule.kind === 'compare') {
      if (selected.length < 2) continue;
      for (const key of rule.fields) {
        const pairs = selected.filter(d => d.classificationVerified).flatMap(d => (d.fields[key] || []).filter(usable).map(f => ({ d, f })));
        const missing = selected.filter(d => !(d.fields[key] || []).some(usable));
        if (pairs.length < 2 || missing.length) add(rule.id, 'unverifiable', 'unverified', `${policy.fields[key].label} cannot be compared across all relevant records.`, missing[0] || selected[0]);
        const differing = pairs.length > 1 && pairs.find(p => canonical(p.f.value) !== canonical(pairs[0].f.value));
        if (differing) {
          add(rule.id, 'inconsistency', 'potential_inconsistency', `${policy.fields[key].label} differs across submitted records.`, pairs[0].d, { ...pairs[0].f, label: policy.fields[key].label }, differing.d, differing.f);
          findings.at(-1).evidence = pairs.map(p => source(p.d, p.f, policy.fields[key].label));
        }
      }
    } else {
      for (const doc of selected) for (const key of rule.fields) {
        const values = doc.fields[key] || [], good = values.filter(usable);
        const label = policy.fields[key].label;
        if (!good.length || !doc.classificationVerified) {
          add(rule.id, rule.kind === 'required_fields' ? 'incomplete_information' : 'unverifiable', 'unverified', `${label} is missing or cannot be verified in ${doc.file}.`, doc, { ...values[0], label });
          continue;
        }
        for (const f of good) {
          if (rule.kind === 'format' && !new RegExp(rule.pattern).test(f.value)) add(rule.id, 'invalid_format', 'confirmed_rule_violation', `${label} does not match the configured format.`, doc, { ...f, label });
          if (rule.kind === 'date') {
            const time = /^\d{4}-\d{2}-\d{2}$/.test(f.value) ? Date.parse(`${f.value}T00:00:00Z`) : NaN;
            const today = Date.parse(`${assessmentDate}T00:00:00Z`), age = (today - time) / 86400000;
            if (!Number.isFinite(time)) add(rule.id, 'unverifiable', 'unverified', `${label} is not an unambiguous date.`, doc, { ...f, label });
            else if ((rule.maxAgeDays !== undefined && (age > rule.maxAgeDays || age < -(rule.allowFutureDays || 0))) || (rule.notExpired && age > 0)) add(rule.id, 'invalid_date', 'confirmed_rule_violation', `${label} falls outside the configured date limits.`, doc, { ...f, label });
          }
        }
      }
    }
  }
  if (!policy.productionReady) add('system-example-policy', 'manual_verification', 'unverified', 'This assessment uses sample requirements. An LGU administrator must publish an authorized policy.');
  return { findings, missingDocuments: [...new Set(missingDocuments)], decision: null, humanReviewRequired: true };
}
