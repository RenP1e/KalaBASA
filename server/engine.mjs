import { randomBytes, randomUUID } from 'node:crypto';
import { digest } from './auth.mjs';
import { ocrDocument } from './ocr.mjs';
import { OllamaExtractor } from './extraction.mjs';
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
  const field = key => job.documents.flatMap(d => d.fields?.[key] || []).find(f => f.verification === 'grounded_in_ocr')?.value || 'Unavailable';
  const format = at => {
    const d = new Date(at);
    return { date: d.toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', day: '2-digit', month: 'short', year: 'numeric' }), time: d.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) };
  };
  const findings = (job.findings || []).map(f => ({ ...f, a: withUrl(f.a, job), b: withUrl(f.b, job) }));
  return {
    id: job.id, ref: job.ref, name: field('business_name'), owner: field('owner_name'), address: field('business_address'),
    type: job.applicationType === 'renewal' ? 'Renewal' : 'New permit', at: Date.parse(job.createdAt), submitted: format(job.createdAt).date,
    submittedBy: job.applicant.email, agoMin: Math.max(0, (Date.now() - Date.parse(job.createdAt)) / 60000),
    docs: job.documents.map(d => d.file), findings, decision: job.decision,
    status: job.decision?.type === 'approved' ? 'Processed' : job.decision?.type === 'returned' ? 'Returned' : 'In review',
    held: false, complete: false, docsComplete: !(job.missingDocuments || []).length,
    note: processingLabels[job.state], processingState: job.state, transmissionState: job.transmissionState,
    remoteReceipt: job.remoteReceipt || null, revision: job.revision, humanReviewRequired: true,
    analysis: {
      assessmentId: job.id, model: job.model?.name || 'Local AI unavailable', modelDigest: job.model?.digest || null,
      requirementsVersion: job.policy.version, requirementsHash: job.policy.hash, requirementsLabel: job.policy.label,
      analyzedAt: job.completedAt, missingDocuments: job.missingDocuments || [],
      documents: job.documents.map(d => ({ file: d.file, id: d.id, pages: d.pages?.length || 0, documentType: d.documentType,
        sourceUrl: `/api/assessments/${job.id}/documents/${d.id}`, fields: Object.entries(job.policy.fields).flatMap(([key, spec]) => {
          const values = d.fields?.[key] || [];
          return values.length ? values.map(f => ({ key, label: spec.label, value: f.value, raw: f.raw, quote: f.quote, page: f.page, confidence: f.confidence, verification: f.verification, flagged: f.verification !== 'grounded_in_ocr' })) : [{ key, label: spec.label, value: null, page: null, flagged: true, verification: 'unavailable' }];
        }) })),
    },
  };
}
function withUrl(src, job) {
  return src && { ...src, sourceUrl: src.documentId && src.page ? `/api/assessments/${job.id}/documents/${src.documentId}/pages/${src.page}` : null };
}
