import { randomBytes, randomUUID } from 'node:crypto';
import { digest } from './auth.mjs';
import { ocrDocument } from './ocr.mjs';
import { OllamaExtractor, classifyPage, isGrounded, canonical } from './extraction.mjs';
import { validateCompliance } from './rules.mjs';

export const processingLabels = {
  uploading: 'Uploading documents', extracting_text: 'Extracting text', identifying_information: 'Identifying information',
  validating_compliance: 'Validating compliance', generating_findings: 'Generating findings',
  assessment_completed: 'Assessment completed', manual_review_required: 'Manual review required', local_ai_unavailable: 'Local AI service unavailable',
};
export const terminalStates = ['assessment_completed', 'manual_review_required', 'local_ai_unavailable'];
export class Engine {
  constructor(store, cfg, { ocr = ocrDocument, extractor = new OllamaExtractor(cfg) } = {}) {
    this.store = store; this.cfg = cfg; this.ocr = ocr; this.extractor = extractor; this.running = false; this.stopped = false;
  }
  create(user, files, policy, applicationType) {
    const id = randomUUID(), verificationToken = randomBytes(32).toString('base64url');
    const job = {
      id, ref: `BP-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`, ownerId: user.id, applicant: user,
      lguId: policy.lguId, applicationType, policy: structuredClone(policy), createdAt: new Date().toISOString(),
      assessmentDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
      state: 'uploading', progress: 0, transmissionState: 'local_only', decision: null, revision: 1, verificationToken,
      documents: files.map(f => ({ id: randomUUID(), file: f.originalname, mime: f.mimetype })),
    };
    this.store.transaction(() => {
      job.documents.forEach((d, i) => this.store.put('files', d.id, { jobId: id, data: files[i].buffer.toString('base64'), mime: d.mime, hash: digest(files[i].buffer) }));
      this.store.put('jobs', id, job);
      this.store.put('verification', digest(verificationToken), { jobId: id });
      this.store.audit(user.id, 'documents_uploaded', id, { count: files.length, policyVersion: policy.version, policyHash: policy.hash });
    });
    this.kick(); return job;
  }
  update(id, values) { const job = this.store.get('jobs', id); Object.assign(job, values); this.store.put('jobs', id, job); return job; }
  recover() {
    // Interrupted jobs re-run from encrypted originals against the SAME policy snapshot.
    for (const job of this.store.list('jobs')) if (!terminalStates.includes(job.state) && !job.imported) this.update(job.id, { state: 'uploading', progress: 0 });
    this.kick();
  }
  kick() {
    if (this.running || this.stopped) return;
    this.running = true;
    this.pending = (async () => {
      try {
        for (;;) {
          if (this.stopped) break;
          const job = this.store.list('jobs').find(j => !terminalStates.includes(j.state) && !j.imported);
          if (!job) break;
          try { await this.process(job); }
          catch {
            this.update(job.id, { state: 'manual_review_required', error: 'PROCESSING_FAILED', humanReviewRequired: true });
            this.store.audit('local-engine', 'processing_failed', job.id);
          }
        }
      } finally { this.running = false; }
    })();
  }
  async process(job) {
    let model = null;
    try { model = await this.extractor.available(); } catch { /* OCR and deterministic validation continue locally. */ }
    const documents = [];
    for (const [index, meta] of job.documents.entries()) {
      this.update(job.id, { state: 'extracting_text', progress: Math.round(index / job.documents.length * 70) });
      const file = this.store.get('files', meta.id);
      const doc = { ...meta, pages: [], fields: {}, documentType: 'unknown', classificationVerified: false };
      try {
        const result = await this.ocr(Buffer.from(file.data, 'base64'), this.cfg);
        doc.mime = result.type;
        for (const page of result.pages) {
          const { image, ...savedPage } = page;
          Object.assign(savedPage, classifyPage(page, job.policy));
          if (image) this.store.put('pages', `${meta.id}:${page.page}`, { jobId: job.id, data: image.toString('base64') });
          this.update(job.id, { state: 'identifying_information' });
          if (model && page.text.length <= 14000 && !page.unreliable) {
            try {
              const extraction = await this.extractor.extract(page, job.policy);
              Object.assign(savedPage, extraction);
              for (const [key, field] of Object.entries(extraction.fields)) if (field) (doc.fields[key] ||= []).push(field);
            } catch (e) {
              savedPage.extractionError = ['INVALID_EXTRACTION', 'SyntaxError'].includes(e.message) || e instanceof SyntaxError ? 'INVALID_EXTRACTION' : 'LOCAL_AI_UNAVAILABLE';
              if (savedPage.extractionError === 'LOCAL_AI_UNAVAILABLE') model = null;
            }
          } else savedPage.extractionError = model ? 'UNRELIABLE_OR_OVERSIZED_TEXT' : 'LOCAL_AI_UNAVAILABLE';
          doc.pages.push(savedPage);
        }
        const types = [...new Set(doc.pages.filter(p => p.classificationVerified).map(p => p.documentType))];
        if (types.length === 1) { doc.documentType = types[0]; doc.classificationVerified = true; }
      } catch (e) { doc.error = ['PAGE_LIMIT', 'UNSUPPORTED_FORMAT', 'OCR_UNAVAILABLE', 'OCR_TIMEOUT'].includes(e.message) ? e.message : 'OCR_UNREADABLE'; }
      documents.push(doc);
    }
    this.update(job.id, { state: 'validating_compliance', progress: 80 });
    const result = validateCompliance(documents, job.policy, job.applicationType, job.assessmentDate);
    this.update(job.id, { state: 'generating_findings', progress: 95 });
    const state = !model ? 'local_ai_unavailable' : result.findings.length ? 'manual_review_required' : 'assessment_completed';
    this.store.transaction(() => {
      this.update(job.id, { ...result, documents, model, state, progress: 100, completedAt: new Date().toISOString() });
      this.store.audit('local-engine', 'assessment_completed', job.id, { state, policyHash: job.policy.hash, model, findings: result.findings.length });
    });
  }
  async stop() { this.stopped = true; await this.pending; }
}

export function applicationView(job) {
  const field = key => job.documents.flatMap(d => d.fields?.[key] || []).find(isGrounded)?.value || 'Unavailable';
  const format = at => {
    const d = new Date(at);
    return { date: d.toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', day: '2-digit', month: 'short', year: 'numeric' }), time: d.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) };
  };
  const findings = (job.findings || []).map(f => ({ ...f, a: withUrl(f.a, job), b: withUrl(f.b, job), evidence: (f.evidence || []).map(src => withUrl(src, job)) }));
  return {
    id: job.id, ref: job.ref, name: field('business_name'), owner: field('owner_name'), address: field('business_address'),
    type: job.applicationType === 'renewal' ? 'Renewal' : 'New permit', at: Date.parse(job.createdAt), submitted: format(job.createdAt).date,
    submittedBy: job.applicant.email, agoMin: Math.max(0, (Date.now() - Date.parse(job.createdAt)) / 60000),
    docs: job.documents.map(d => d.file), findings, decision: job.decision,
    status: job.decision?.type === 'approved' ? 'Processed' : job.decision?.type === 'returned' ? 'Returned' : 'In review',
    held: false, complete: false, docsComplete: !(job.missingDocuments || []).length && !(job.findings || []).some(f => f.category === 'missing_document'),
    note: processingLabels[job.state], processingState: job.state, transmissionState: job.transmissionState,
    remoteReceipt: job.remoteReceipt || null, revision: job.revision, humanReviewRequired: true,
    analysis: {
      assessmentId: job.id, model: job.model?.name || 'Local AI unavailable', modelDigest: job.model?.digest || null,
      requirementsVersion: job.policy.version, requirementsHash: job.policy.hash, requirementsLabel: job.policy.label,
      analyzedAt: job.completedAt, missingDocuments: job.missingDocuments || [],
      unverifiedDocuments: (job.findings || []).filter(f => f.category === 'missing_document' && f.verificationStatus === 'unverified').map(f => ({ label: f.title.replace(' has not been verified among the uploaded documents.', ''), ruleId: f.ruleId })),
      documents: job.documents.map(d => ({ file: d.file, id: d.id, pages: d.pages?.length || 0, documentType: d.documentType, classificationVerified: d.classificationVerified,
        pageSources: (d.pages || []).map(p => ({ page: p.page, textSource: p.textSource || 'ocr', engine: p.engine || 'tesseract', confidence: p.confidence })),
        sourceUrl: `/api/assessments/${job.id}/documents/${d.id}`, fields: Object.entries(job.policy.fields).filter(([key]) => {
          const configured = job.policy.documentTypes[d.documentType]?.extractFields;
          return !configured || configured.includes(key) || d.fields?.[key]?.length || requiredField(job, d, key);
        }).flatMap(([key, spec]) => {
          const values = d.fields?.[key] || [];
          const documentUrl = `/api/assessments/${job.id}/documents/${d.id}`, required = requiredField(job, d, key);
          return values.length ? values.map(f => {
            const page = sourcePage(f, d), textSource = f.textSource || d.pages?.find(p => p.page === page)?.textSource || 'ocr';
            return { key, label: spec.label, value: f.value, raw: f.raw, quote: f.quote, page, confidence: f.confidence, verification: f.verification, textSource,
              required, documentId: d.id, documentUrl, sourceUrl: page ? `${documentUrl}/pages/${page}` : null,
              sourceStatus: page ? 'located' : 'document_only', flagged: !isGrounded(f) };
          }) : [{ key, label: spec.label, value: null, page: null, raw: null, quote: null, required, documentId: d.id, documentUrl, sourceUrl: null,
            sourceStatus: 'not_extracted', flagged: required, verification: 'unavailable',
            reason: d.error ? 'Document could not be read. Inspect the original.' : d.pages?.some(p => p.extractionError) ? 'Automatic extraction could not verify this field. Inspect the original.' : required ? 'Required field was not extracted. Check the original document.' : 'Optional field was not extracted from this document.' }];
        }) })),
    },
  };
}
function withUrl(src, job) {
  if (!src) return src;
  const doc = job.documents.find(d => d.id === src.documentId), page = doc && sourcePage(src, doc);
  const documentUrl = doc ? `/api/assessments/${job.id}/documents/${doc.id}` : null;
  return { ...src, page: page || null, documentUrl, sourceKind: doc ? page ? 'page' : 'document' : 'checklist',
    meta: page ? src.meta?.startsWith('Page ') ? src.meta : `Page ${page} · ${src.label || 'Document'}` : doc ? 'Document-level check · no value located' : 'LGU checklist · no document page',
    sourceUrl: page ? `${documentUrl}/pages/${page}` : null };
}
function requiredField(job, doc, key) {
  return job.policy.rules.some(r => r.enabled && r.kind === 'required_fields' && (!r.applicationTypes || r.applicationTypes.includes(job.applicationType)) && (!r.documentTypes || r.documentTypes.includes(doc.documentType)) && r.fields.includes(key));
}
function sourcePage(field, doc) {
  const pages = doc.pages || [];
  if (Number.isInteger(field.page) && field.page > 0 && pages.some(p => p.page === field.page)) return field.page;
  // Recover an omitted reference only when existing evidence identifies exactly one saved page.
  const needle = canonical(field.quote || field.raw || field.value || '');
  if (!needle) return null;
  const matching = pages.filter(p => canonical(p.text || '').includes(needle));
  return matching.length === 1 ? matching[0].page : null;
}
