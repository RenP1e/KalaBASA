import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { activePolicy, savePolicy } from './policy.mjs';
import { createUser, digest, login, session, changePassword } from './auth.mjs';
import { detectType } from './ocr.mjs';
import { Engine, applicationView, terminalStates } from './engine.mjs';
import { Synchronizer, receiveSubmission, tokenEquals } from './sync.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (status, message) => Object.assign(new Error(message), { status });
export function createApp(store, cfg, dependencies = {}) {
  const app = express(), engine = new Engine(store, cfg, dependencies), sync = new Synchronizer(store, cfg, dependencies.syncFetch);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    // Reject DNS rebinding and cross-origin browser writes. Listen on loopback only.
    const allowed = [`127.0.0.1:${cfg.port}`, `localhost:${cfg.port}`, `[::1]:${cfg.port}`];
    if (!allowed.includes(req.headers.host)) return res.status(403).json({ error: 'Invalid host.' });
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" });
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) return res.status(403).json({ error: 'Cross-origin access is disabled.' });
    next();
  });
  // This route authenticates the receiving peer separately and commits receipt + documents atomically.
  app.post('/api/sync/receive', (req, res, next) => {
    if (!tokenEquals(req.headers.authorization?.replace(/^Bearer /, ''), cfg.inboundToken)) return res.status(401).json({ error: 'Unauthorized sync peer.' });
    next();
  }, express.json({ limit: '335mb' }), (req, res) => {
    try {
      if (req.headers['idempotency-key'] !== req.body.idempotencyKey) throw new Error('Key mismatch.');
      const ack = receiveSubmission(store, req.body, cfg); engine.kick(); res.json(ack);
    } catch { throw fail(400, 'Submission was not accepted. Check payload, destination LGU and idempotency key.'); }
  });
  app.use(express.json({ limit: '256kb' }));
  const attempts = new Map();
  app.post('/api/auth/login', (req, res) => {
    const key = req.socket.remoteAddress, current = attempts.get(key);
    const attempt = current?.until > Date.now() ? current : { count: 0, until: Date.now() + 60000 };
    if (attempt.count >= 10) throw fail(429, 'Too many sign-in attempts. Wait one minute.');
    attempt.count++; attempts.set(key, attempt);
    const result = login(store, req.body.email, req.body.password);
    if (!result) throw fail(401, 'Incorrect email or password.');
    attempts.delete(key);
    res.set('Set-Cookie', `kb_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${cfg.secureCookie ? '; Secure' : ''}`);
    res.json({ user: result.user, csrf: result.csrf });
  });
  app.get('/api/verify/:token', (req, res) => {
    const record = /^[A-Za-z0-9_-]{43}$/.test(req.params.token) && store.get('verification', digest(req.params.token));
    const job = record && store.get('jobs', record.jobId);
    if (!job) throw fail(404, 'Verification record not found.');
    // Deliberately no names, addresses, document values, or full findings in bearer-token verification.
    store.audit('verification-token-holder', 'verification_accessed', job.id);
    res.json({ recordValid: true, assessmentCompleted: !!job.completedAt, humanReviewRequired: true,
      transmissionState: job.transmissionState, requirementsVersion: job.policy.version,
      officialDecision: job.decision?.type === 'approved' || job.decision?.type === 'returned' ? job.decision.type : 'not_recorded' });
  });
  app.use('/api', (req, res, next) => {
    req.auth = session(store, req);
    if (!req.auth) return res.status(401).json({ error: 'Sign in to continue.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-csrf-token'] !== req.auth.csrf) return res.status(403).json({ error: 'Session verification failed. Sign in again.' });
    next();
  });
  const isReviewer = req => ['reviewer', 'admin'].includes(req.auth.user.role);
  const accessible = (job, user) => job && job.lguId === user.lguId && (job.ownerId === user.id || (user.role !== 'applicant' && job.transmissionState === 'received_by_lgu'));
  function getJob(req) {
    const job = store.get('jobs', req.params.id);
    if (!accessible(job, req.auth.user)) throw fail(404, 'Assessment not found.');
    return job;
  }
  function admin(req, res, next) { if (req.auth.user.role !== 'admin') throw fail(403, 'LGU administrator access required.'); next(); }
  app.get('/api/auth/me', (req, res) => res.json({ user: req.auth.user, csrf: req.auth.csrf }));
  app.post('/api/auth/password', (req, res) => {
    try { changePassword(store, req.auth, req.body.currentPassword, req.body.newPassword); res.json({ ok: true }); }
    catch (e) { throw fail(400, e.message); }
  });
  app.post('/api/auth/logout', (req, res) => {
    store.transaction(() => { store.delete('sessions', req.auth.tokenHash); store.audit(req.auth.user.id, 'logout', req.auth.user.id); });
    res.set('Set-Cookie', 'kb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0').json({ ok: true });
  });
  app.get('/api/health', async (req, res) => {
    let model;
    try { model = await engine.extractor.available(); } catch { model = null; }
    res.json({ local: true, model, modelConfigured: cfg.model, submissionMode: cfg.submissionMode, syncConfigured: !!(cfg.syncUrl && cfg.syncToken), policy: activePolicy(store, req.auth.user.lguId)?.version || null });
  });
  app.get('/api/requirements', (req, res) => res.json(activePolicy(store, req.auth.user.lguId)));
  app.get('/api/admin/requirements/history', admin, (req, res) => res.json(store.list('policies').filter(p => p.lguId === req.auth.user.lguId)));
  app.post('/api/admin/requirements', admin, (req, res) => {
    if (req.body.lguId !== req.auth.user.lguId) throw fail(403, 'Requirements belong to another LGU.');
    try { res.status(201).json(savePolicy(store, req.body, req.auth.user.id)); }
    catch (e) { throw fail(400, e.message); }
  });
  app.post('/api/admin/users', admin, (req, res) => {
    if (req.body.lguId !== req.auth.user.lguId) throw fail(403, 'Account belongs to another LGU.');
    try { res.status(201).json(createUser(store, req.body, req.auth.user.id)); } catch (e) { throw fail(400, e.message); }
  });
  app.get('/api/admin/users', admin, (req, res) => {
    store.audit(req.auth.user.id, 'account_list_accessed', req.auth.user.lguId);
    res.json(store.list('users').filter(u => u.lguId === req.auth.user.lguId).map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, lguId: u.lguId })));
  });
  app.get('/api/admin/audit', admin, (req, res) => {
    const lguId = req.auth.user.lguId;
    store.audit(req.auth.user.id, 'audit_log_accessed', lguId);
    const targets = new Map([[lguId, lguId]]);
    for (const user of store.list('users')) targets.set(user.id, user.lguId);
    for (const job of store.list('jobs')) {
      targets.set(job.id, job.lguId);
      for (const doc of job.documents) targets.set(doc.id, job.lguId);
    }
    res.json(store.auditRecords().filter(event => targets.get(event.actor) === lguId || targets.get(event.target) === lguId || targets.get(event.target.split(':')[0]) === lguId || event.target.startsWith(`${lguId}:`) || event.detail.lguId === lguId));
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { files: cfg.maxFiles, fileSize: cfg.maxFileBytes, fields: 1, fieldSize: 4096, parts: cfg.maxFiles + 1 } });
  app.post('/api/assessments', (req, res, next) => {
    const active = store.list('jobs').filter(j => !terminalStates.includes(j.state));
    if (active.length >= 4) throw fail(429, 'The local processing queue is full. Try again after an assessment completes.');
    next();
  }, upload.array('files', cfg.maxFiles), (req, res) => {
    if (!req.files?.length) throw fail(400, 'Upload at least one document.');
    const names = new Set();
    for (const file of req.files) {
      const mime = detectType(file.buffer);
      if (!mime || !/\.(pdf|png|jpe?g)$/i.test(file.originalname)) throw fail(415, 'Only PDF, PNG and JPG documents are supported.');
      file.originalname = path.basename(file.originalname).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180);
      if (names.has(file.originalname)) throw fail(400, 'Each document must have a unique file name.');
      names.add(file.originalname); file.mimetype = mime;
    }
    const applicationType = req.body.applicationType || 'new';
    if (!['new', 'renewal'].includes(applicationType)) throw fail(400, 'Select a new or renewal application.');
    const policy = activePolicy(store, req.auth.user.lguId);
    if (!policy) throw fail(409, 'An administrator must configure LGU requirements first.');
    const job = engine.create(req.auth.user, req.files, policy, applicationType);
    res.status(202).json({ id: job.id, state: job.state });
  });
  app.get('/api/assessments', (req, res) => {
    store.audit(req.auth.user.id, 'assessment_list_accessed', req.auth.user.lguId);
    res.json(store.list('jobs').filter(j => accessible(j, req.auth.user)).map(applicationView).sort((a, b) => (Date.parse(b.submittedAt) || b.at) - (Date.parse(a.submittedAt) || a.at)));
  });
  app.get('/api/assessments/:id', (req, res) => {
    const job = getJob(req); store.audit(req.auth.user.id, 'assessment_accessed', job.id);
    res.json({ ...applicationView(job), progress: job.progress, error: job.error || null });
  });
  app.post('/api/assessments/:id/retry', (req, res) => {
    const job = getJob(req);
    if (!terminalStates.includes(job.state) || job.decision || job.transmissionState !== 'local_only') throw fail(409, 'Only a completed, unsubmitted local assessment can be retried.');
    const policy = req.body?.useCurrentRequirements === true ? activePolicy(store, job.lguId) : job.policy;
    if (!policy) throw fail(409, 'No active LGU requirements are available.');
    store.transaction(() => {
      store.put('assessmentHistory', `${job.id}:${job.revision}`, job);
      Object.assign(job, { state: 'uploading', progress: 0, revision: job.revision + 1, findings: [], completedAt: null, error: null, policy,
        documents: job.documents.map(d => ({ id: d.id, file: d.file, mime: d.mime })) });
      store.put('jobs', job.id, job); store.audit(req.auth.user.id, 'assessment_retry', job.id, { revision: job.revision, policyVersion: policy.version, policyHash: policy.hash, useCurrentRequirements: req.body?.useCurrentRequirements === true });
    });
    engine.kick(); res.status(202).json({ id: job.id });
  });
  app.get('/api/assessments/:id/documents/:docId', (req, res) => {
    const job = getJob(req), doc = job.documents.find(d => d.id === req.params.docId);
    if (!doc) throw fail(404, 'Document not found.');
    const file = store.get('files', doc.id);
    store.audit(req.auth.user.id, 'document_accessed', doc.id);
    res.set('Content-Disposition', `inline; filename="document${file.mime === 'application/pdf' ? '.pdf' : file.mime === 'image/png' ? '.png' : '.jpg'}"`).type(file.mime).send(Buffer.from(file.data, 'base64'));
  });
  app.get('/api/assessments/:id/documents/:docId/pages/:page', (req, res) => {
    const job = getJob(req);
    if (!job.documents.some(d => d.id === req.params.docId) || !/^[1-9]\d?$/.test(req.params.page)) throw fail(404, 'Page not found.');
    const page = store.get('pages', `${req.params.docId}:${req.params.page}`);
    if (!page || page.jobId !== job.id) throw fail(404, 'Page not found.');
    store.audit(req.auth.user.id, 'source_page_accessed', `${req.params.docId}:${req.params.page}`);
    res.type('png').send(Buffer.from(page.data, 'base64'));
  });
  app.post('/api/assessments/:id/findings/:key', (req, res) => {
    if (!isReviewer(req)) throw fail(403, 'Only authorized reviewers can review findings.');
    const job = getJob(req);
    if (!terminalStates.includes(job.state) || job.decision || job.transmissionState === 'queued' || job.transmissionState === 'transmitted') throw fail(409, 'Assessment is processing, submitted, or already decided.');
    if (job.revision !== req.body.revision) throw fail(409, 'Assessment changed. Refresh before reviewing.');
    const f = job.findings?.find(f => f.key === req.params.key);
    if (!f || !['confirmed', 'dismissed', 'escalated'].includes(req.body.status)) throw fail(400, 'Invalid finding or review status.');
    store.transaction(() => {
      f.status = req.body.status; f.reviewedBy = req.auth.user.id; f.reviewedAt = new Date().toISOString(); job.revision++;
      store.put('jobs', job.id, job); store.audit(req.auth.user.id, 'finding_reviewed', job.id, { key: f.key, status: f.status });
    }); res.json(applicationView(job));
  });
  app.post('/api/assessments/:id/decisions', (req, res) => {
    if (!isReviewer(req)) throw fail(403, 'Only authorized reviewers can make decisions.');
    const job = getJob(req), type = req.body.type;
    if (!['approved', 'returned', 'forwarded'].includes(type)) throw fail(400, 'Invalid decision.');
    if (job.revision !== req.body.revision || job.decision || !job.completedAt || !terminalStates.includes(job.state) || ['queued', 'transmitted'].includes(job.transmissionState)) throw fail(409, 'Refresh the completed assessment before making a decision.');
    if (type !== 'returned' && job.findings?.some(f => f.status !== 'dismissed')) throw fail(409, 'Resolve findings before forwarding or approving.');
    if (type === 'approved' && (typeof req.body.reason !== 'string' || req.body.reason.trim().length < 10)) throw fail(400, 'An official decision requires a review reason (10+ characters).');
    store.transaction(() => {
      if (type === 'forwarded') job.forwardedAt = new Date().toISOString();
      else job.decision = { type, by: req.auth.user.name, userId: req.auth.user.id, at: new Date().toISOString(), reason: String(req.body.reason || '').slice(0, 2000), date: new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Manila' }), time: new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) };
      job.revision++; store.put('jobs', job.id, job);
      store.audit(req.auth.user.id, `application_${type}`, job.id, { reason: job.decision?.reason || '' });
    }); res.json(applicationView(job));
  });
  app.post('/api/assessments/:id/submit', (req, res) => {
    const job = getJob(req);
    if (job.ownerId !== req.auth.user.id) throw fail(403, 'Only the local application owner can submit it.');
    if (job.transmissionState === 'received_by_lgu' && job.submission?.channel === 'local') {
      return res.json({ transmissionState: job.transmissionState, channel: 'local', receipt: job.submission.receipt, submittedAt: job.submission.submittedAt });
    }
    if (job.transmissionState === 'received_by_lgu') throw fail(409, 'This application was already received by an LGU.');
    if (!terminalStates.includes(job.state) || !job.completedAt || job.decision) throw fail(409, 'Complete the local assessment before submitting it for review.');
    if (cfg.submissionMode === 'local') {
      if (job.transmissionState !== 'local_only') throw fail(409, 'This application is already queued for external delivery and cannot also be submitted locally.');
      const submission = { channel: 'local', submittedAt: new Date().toISOString(), receipt: `LGU-${randomUUID()}`, submittedBy: req.auth.user.id };
      store.transaction(() => {
        job.submission = submission; job.transmissionState = 'received_by_lgu'; job.revision++;
        store.put('jobs', job.id, job);
        store.audit(req.auth.user.id, 'application_submitted_locally', job.id, { lguId: job.lguId, receipt: submission.receipt, documents: job.documents.length });
      });
      return res.status(201).json({ transmissionState: job.transmissionState, ...submission });
    }
    try { sync.queue(job, req.auth.user.id); } catch (e) { throw fail(409, e.message); }
    res.status(202).json({ transmissionState: store.get('jobs', job.id).transmissionState, channel: 'remote', syncConfigured: !!(cfg.syncUrl && cfg.syncToken) });
  });
  app.post('/api/sync/run', async (req, res) => { await sync.flush(); res.json({ ok: true }); });
  app.get('/api/assessments/:id/qr', async (req, res) => {
    const job = getJob(req);
    if (!job.verificationToken) throw fail(404, 'This record has no local verification token.');
    const value = `/api/verify/${job.verificationToken}`;
    store.audit(req.auth.user.id, 'verification_qr_generated', job.id);
    res.json({ value, image: await QRCode.toDataURL(value, { errorCorrectionLevel: 'M', width: 192, margin: 2 }) });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  // Explicit public asset allowlist. Never expose var/, .env, tests, source server, or node_modules.
  for (const directory of ['assets', 'css', 'js', 'vendor']) app.use(`/${directory}`, express.static(path.join(root, directory), { dotfiles: 'deny' }));
  app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err instanceof multer.MulterError ? 413 : err.status || (err.type === 'entity.too.large' ? 413 : 500);
    res.status(status).json({ error: status === 500 ? 'Local processing failed. Check service health and retry.' : err instanceof multer.MulterError ? 'Upload exceeds the permitted file count or size.' : err.message });
  });
  return { app, engine, sync };
}
