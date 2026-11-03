// AI service layer: the ONLY place the app talks to "the AI".
//
//   UI (scan.js) -> KB.ai.analyze({ files, previous }) -> provider (mock | http | yours) -> normalize() -> store
//
// To plug in a real model, add a provider (see ai/providers/http.js) and set KB.AI.provider in config.js.
// Nothing in the UI or the store needs to change. Full guide: AI_INTEGRATION.md.
//
// ---------------------------------------------------------------------------------------------------
// DATA CONTRACT (what a provider must return; everything is validated/defaulted by normalize() below)
//
// AnalysisResult = {
//   findings:         Finding[],            // inconsistencies/risks the reviewer must look at ([] = clean)
//   documents?:       DocumentExtraction[], // per-file extracted fields (shown on the "Extracted Fields" page)
//   missingDocuments?: string[],            // required documents not found, e.g. ['Barangay Clearance']
//   model?:           string,               // model/version label, for audit
// }
// Finding = {
//   key:    string,                         // stable machine id, e.g. 'address_mismatch' (not shown to users)
//   title:  string,                         // short headline, e.g. 'Possible address inconsistency'
//   why:    string,                         // 1-2 sentence plain-language explanation for the reviewer
//   tags?:  { t: string, tone?: 'warn'|'info' }[],
//   a: Source, b: Source,                   // the two excerpts being compared (b may repeat the same file)
//   confidence?: number,                    // 0..1, kept on the finding for future UI/audit use
// }
// Source = {
//   file:  string,                          // file name as uploaded
//   page:  number,                          // 1-based page
//   meta:  string,                          // e.g. 'Page 1 · Business address'
//   label: string,                          // field name, e.g. 'Business address'
//   segs:  { t: string, hl?: boolean }[],   // the text split into pieces; hl:true marks the differing part
//   sub?:  string,                          // optional caption under the value
// }
// DocumentExtraction = { file: string, pages?: number, fields: { label: string, value: string, page?: number, flagged?: boolean }[] }
// ---------------------------------------------------------------------------------------------------
(function () {
  const providers = {};

  class AIError extends Error {
    constructor(message, cause) { super(message); this.name = 'AIError'; this.cause = cause; }
  }

  const str = (v, d) => (typeof v === 'string' && v.trim() ? v : d);
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

  function normSource(s, where) {
    if (!s || typeof s !== 'object') throw new AIError(`AI response invalid: ${where} is missing.`);
    const segs = Array.isArray(s.segs) && s.segs.length
      ? s.segs.map((g) => ({ t: String(g && g.t != null ? g.t : ''), hl: !!(g && g.hl) }))
      : s.value != null ? [{ t: String(s.value), hl: true }] : null; // tolerate a plain `value` string
    if (!segs) throw new AIError(`AI response invalid: ${where}.segs is missing.`);
    const page = num(s.page, 1);
    const label = str(s.label, 'Field');
    return { ...s, file: str(s.file, 'Document'), page: s.page == null ? null : page, meta: str(s.meta, `Page ${page} · ${label}`), label, segs, sub: str(s.sub, '') };
  }

  function normFinding(f, i) {
    if (!f || typeof f !== 'object') throw new AIError(`AI response invalid: finding ${i + 1} is not an object.`);
    const out = { ...f,
      key: str(f.key, `finding-${i + 1}`),
      status: 'awaiting', // reviewer state; a provider can never pre-confirm or pre-dismiss its own finding
      title: str(f.title, 'Possible inconsistency'),
      why: str(f.why, 'The AI flagged this for review. Verify both source pages before deciding.'),
      tags: (Array.isArray(f.tags) ? f.tags : []).map((g) => ({ t: String(g && g.t != null ? g.t : g), tone: g && g.tone === 'info' ? 'info' : 'warn' })),
      a: normSource(f.a, `finding ${i + 1}.a`),
      b: normSource(f.b, `finding ${i + 1}.b`),
    };
    if (Number.isFinite(f.confidence)) out.confidence = Math.max(0, Math.min(1, f.confidence));
    return out;
  }

  function normDoc(d) {
    return { ...d,
      file: str(d && d.file, 'Document'),
      pages: num(d && d.pages, 1),
      fields: (Array.isArray(d && d.fields) ? d.fields : []).filter((x) => x && x.label != null)
        .map((x) => ({ ...x, label: String(x.label), value: x.value == null ? null : String(x.value), page: x.page == null ? null : num(x.page, null), flagged: !!x.flagged })),
    };
  }

  // Raw provider output -> the exact shape the rest of the app relies on. Throws AIError if unusable.
  function normalize(raw, providerName) {
    if (!raw || typeof raw !== 'object') throw new AIError('AI response was empty or not JSON.');
    if (!Array.isArray(raw.findings)) throw new AIError('AI response invalid: "findings" must be an array (use [] when nothing is wrong).');
    return {
      ...raw,
      findings: raw.findings.map(normFinding),
      documents: (Array.isArray(raw.documents) ? raw.documents : []).map(normDoc),
      missingDocuments: (Array.isArray(raw.missingDocuments) ? raw.missingDocuments : []).map(String),
      model: str(raw.model, providerName),
      analyzedAt: Date.now(),
    };
  }

  // Order-independent fingerprint of the uploaded file names (used to detect "resubmitted the same files").
  const signature = (names) => names.slice().sort().join('|');

  // Run the configured provider on the uploaded files.
  //   files:    File[]  the real browser File objects (PDF/JPG/PNG), already size/type checked by the UI
  //   previous: { sig, attempts, findings } | null   set when an applicant is resubmitting a held application
  // Resolves with a normalized AnalysisResult; rejects with AIError (message is safe to show in a toast).
  async function analyze({ files, previous, applicationType, onProgress }) {
    const cfg = KB.AI;
    const run = providers[cfg.provider];
    if (!run) throw new AIError(`AI provider "${cfg.provider}" is not registered. Check KB.AI.provider in js/config.js.`);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
    try {
      const raw = await run({
        files, names: files.map((f) => f.name), previous: previous || null,
        applicant: { name: KB.USER.name, email: KB.USER.email, role: KB.access() },
        signal: ctl.signal, config: cfg, applicationType, onProgress,
      });
      return normalize(raw, cfg.provider);
    } catch (e) {
      if (e instanceof AIError) throw e;
      if (e && e.name === 'AbortError') throw new AIError('The AI check took too long. Please try again.', e);
      throw new AIError('The AI check could not be completed. Please try again.', e);
    } finally { clearTimeout(timer); }
  }

  // Add a provider: KB.ai.register('myModel', async ({ files, names, previous, applicant, signal, config }) => rawResult)
  const register = (name, fn) => { providers[name] = fn; };

  KB.ai = { analyze, register, normalize, signature, AIError, providers };
})();
