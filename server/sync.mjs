import { randomUUID, timingSafeEqual } from 'node:crypto';
import { digest } from './auth.mjs';
import { terminalStates } from './engine.mjs';
import { detectType } from './ocr.mjs';
export function tokenEquals(a, b) {
  if (!a || !b) return false;
  return timingSafeEqual(Buffer.from(digest(a), 'hex'), Buffer.from(digest(b), 'hex'));
}
export class Synchronizer {
  constructor(store, cfg, fetcher = fetch) {
    this.store = store; this.cfg = cfg; this.fetch = fetcher; this.running = false;
    if (!store.get('system', 'installation')) store.put('system', 'installation', { id: randomUUID() });
    // An interrupted request may have reached the receiver. Retry with exactly the same idempotency key.
    for (const item of store.list('outbox')) if (item.state === 'sending') {
      store.put('outbox', item.id, { ...item, state: 'queued', nextAttempt: 0 });
      const job = store.get('jobs', item.jobId); job.transmissionState = 'queued'; store.put('jobs', job.id, job);
    }
  }
  queue(job, actor) {
    if (!terminalStates.includes(job.state) || !job.completedAt) throw new Error('Only completed assessments can be submitted.');
    if (job.transmissionState === 'transmitted' || this.store.list('outbox').some(i => i.jobId === job.id && i.state !== 'sent')) return;
    const id = `${this.store.get('system', 'installation').id}:${job.id}:${job.revision}`;
    const snapshot = structuredClone(job); delete snapshot.verificationToken;
    const payload = { idempotencyKey: id, assessment: snapshot, files: job.documents.map(d => ({ id: d.id, ...this.store.get('files', d.id) })) };
    this.store.transaction(() => {
      this.store.put('outbox', id, { id, jobId: job.id, state: 'queued', attempts: 0, nextAttempt: 0, payload, payloadHash: digest(JSON.stringify(payload)) });
      job.transmissionState = 'queued'; this.store.put('jobs', job.id, job);
      this.store.audit(actor, 'submission_queued', job.id, { idempotencyKey: id });
    });
  }
  async flush(now = Date.now()) {
    if (this.running || !this.cfg.syncUrl || !this.cfg.syncToken) return;
    const url = new URL(this.cfg.syncUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Synchronization requires HTTPS (or loopback for testing).');
    this.running = true;
    try {
      for (const item of this.store.list('outbox').filter(i => i.state !== 'sent' && i.nextAttempt <= now)) {
        this.store.put('outbox', item.id, { ...item, state: 'sending' });
        try {
          const res = await this.fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.syncToken}`, 'Idempotency-Key': item.id }, body: JSON.stringify(item.payload) });
          if (!res.ok) throw new Error('SYNC_FAILED');
          const ack = await res.json();
          if (ack.idempotencyKey !== item.id || ack.payloadHash !== item.payloadHash || typeof ack.receipt !== 'string' || !ack.receipt) throw new Error('INVALID_ACK');
          this.store.transaction(() => {
            this.store.put('outbox', item.id, { ...item, state: 'sent', acknowledgedAt: new Date().toISOString(), receipt: ack.receipt });
            const job = this.store.get('jobs', item.jobId); job.transmissionState = 'transmitted'; job.remoteReceipt = ack.receipt;
            this.store.put('jobs', job.id, job); this.store.audit('synchronizer', 'submission_acknowledged', job.id, { receipt: ack.receipt });
          });
        } catch {
          this.store.put('outbox', item.id, { ...item, state: 'queued', attempts: item.attempts + 1, nextAttempt: now + Math.min(3600000, 1000 * 2 ** Math.min(item.attempts + 1, 12)), lastError: 'Transmission unconfirmed. Retrying safely.' });
        }
      }
    } finally { this.running = false; }
  }
}
export function receiveSubmission(store, payload, cfg) {
  const { idempotencyKey: id, assessment: incoming, files } = payload || {};
  if (typeof id !== 'string' || !/^[a-zA-Z0-9:-]{1,160}$/.test(id)) throw new Error('Invalid idempotency key.');
  const hash = digest(JSON.stringify(payload)), previous = store.get('inbox', id);
  if (previous) {
    if (previous.payloadHash !== hash) throw new Error('Idempotency key reused with different data.');
    return previous;
  }
  if (!incoming || typeof incoming.id !== 'string' || !/^[a-z0-9-]{36}$/.test(incoming.id) || !terminalStates.includes(incoming.state) || !incoming.completedAt || !Array.isArray(incoming.documents) || !incoming.documents.length || !Array.isArray(files) || files.length !== incoming.documents.length || files.length > cfg.maxFiles) throw new Error('Invalid assessment payload.');
  if (incoming.lguId !== cfg.inboundLgu) throw new Error('Submission LGU does not match receiver.');
  for (const d of incoming.documents) {
    const f = files.find(f => f.id === d.id);
    if (!f || typeof f.data !== 'string' || f.data.length > Math.ceil(cfg.maxFileBytes * 4 / 3) + 4) throw new Error('Invalid file.');
    const b = Buffer.from(f.data, 'base64');
    if (!b.length || b.length > cfg.maxFileBytes || !detectType(b) || digest(b) !== f.hash) throw new Error('Document integrity check failed.');
  }
  // Receiver independently re-runs OCR/extraction/rules against its own active LGU policy.
  const active = store.get('activePolicies', cfg.inboundLgu);
  if (!active) throw new Error('Receiver has no active requirements.');
  const policy = store.get('policies', `${cfg.inboundLgu}:${active.version}`);
  const jobId = randomUUID(), ownerId = `remote:${digest(id)}`;
  const ack = { idempotencyKey: id, payloadHash: hash, receipt: `LGU-${randomUUID()}` };
  store.transaction(() => {
    const job = { id: jobId, ref: ack.receipt, ownerId, applicant: { id: ownerId, email: 'remote-submission', name: 'Remote applicant' },
      lguId: cfg.inboundLgu, applicationType: incoming.applicationType === 'renewal' ? 'renewal' : 'new', policy,
      createdAt: new Date().toISOString(), assessmentDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()),
      state: 'uploading', progress: 0, transmissionState: 'received_by_lgu', decision: null, revision: 1,
      documents: incoming.documents.map(d => { const id = randomUUID(); const f = files.find(f => f.id === d.id); store.put('files', id, { jobId, data: f.data, mime: detectType(Buffer.from(f.data, 'base64')), hash: f.hash }); return { id, file: String(d.file).slice(0, 180), mime: detectType(Buffer.from(f.data, 'base64')) }; }),
      sourceAssessment: { id: incoming.id, policyVersion: incoming.policy?.version, policyHash: incoming.policy?.hash },
    };
    store.put('jobs', jobId, job); store.put('inbox', id, ack);
    store.audit('authenticated-sync-peer', 'submission_received', jobId, { receipt: ack.receipt, payloadHash: hash });
  });
  return ack;
}
