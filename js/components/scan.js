// Scan document flow (per the AI-Assisted Review designs): Upload -> AI Check (requirements, extracted fields) -> Review.
(function () {
  const { h, t, cx, Icon } = KB;
  const { useState, useRef } = React;
  const Q = KB.Q;
  const MAX = 20 * 1024 * 1024, OK = /\.(pdf|jpe?g|png)$/i;
  const kb = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const slug = (d) => d.replace(/\.[^.]+$/, '');
  const accent = (a, b) => t('span', null, a + ' ', t('span', 'text-brand', b));

  const STEPS = [['Upload', 'Add or select a document'], ['AI Check', 'Check details and inconsistencies'], ['Review', 'Review AI recommendations']];
  const CSTEPS = [['Upload', 'Add or scan your documents'], ['AI Check', 'We check details and inconsistencies'], ['Report', 'See your findings']];
  function Steps({ n, wide }) {
    const steps = KB.access() === 'consumer' ? CSTEPS : STEPS;
    return t('ol', cx('flex items-center', wide ? 'gap-4' : 'w-[210px] gap-2'), ...steps.flatMap(([l, sub], i) => {
      const st = i + 1 < n ? 'done' : i + 1 === n ? 'now' : 'todo';
      const dot = t('span', cx('grid shrink-0 place-items-center rounded-full font-bold', wide ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs', st === 'done' ? 'bg-ok text-white' : st === 'now' ? 'bg-brand text-white' : 'bg-navy-50 text-slate2'),
        st === 'done' ? Icon('check', 'text-[11px]') : i + 1);
      const item = h('li', { key: 's' + i, className: 'flex items-center gap-3', 'aria-current': st === 'now' ? 'step' : undefined, title: l }, dot,
        wide ? t('span', 'hidden sm:block', t('span', 'block text-sm font-semibold text-navy', l), t('span', 'hidden text-xs text-slate2 md:block', sub)) : t('span', 'sr-only', l));
      return i < 2 ? [item, h('li', { key: 'c' + i, 'aria-hidden': 'true', className: cx('h-0.5 flex-1 rounded', st === 'done' ? 'bg-ok' : 'bg-line') })] : [item];
    }));
  }

  function AppHead({ a, n }) {
    return t('div', 'flex flex-wrap items-start justify-between gap-4',
      t('div', null, t('div', 'flex flex-wrap items-center gap-3', t('h1', 'text-3xl font-bold text-navy', a.ref), t('span', 'rounded-md bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-dark', a.type)),
        t('p', 'mt-1 text-sm text-slate2', `${a.name} · ${KB.APP.office}`)), h(Steps, { n }));
  }
  const notFound = (ref) => h(KB.Shell, { active: 'applications' }, h(KB.Empty, { title: 'Application not found', text: `We couldn’t find ${ref}.`, href: '/applications' }));
  const cardHead = (a, b, sub, icon) => t('div', 'flex items-start justify-between gap-4 p-6', t('div', null, t('h2', 'text-2xl font-bold text-navy', accent(a, b)), t('p', 'mt-1 text-sm text-slate2', sub)),
    t('span', 'grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy', Icon(icon)));

  /* ---------- Step 1: upload / scan / select ---------- */
  KB.pages.Scan = function Scan({ resubRef }) {
    const apps = KB.useStore((s) => s.apps);
    const consumer = KB.access() === 'consumer';
    // Applicant re-uploading after a held submission (inconsistencies found, no receipt yet).
    const held = consumer && resubRef ? apps.find((a) => a.ref === resubRef && a.held && a.submittedBy === KB.USER.email) : null;
    const [files, setFiles] = useState([]);
    const [drag, setDrag] = useState(false);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState('Uploading documents');
    const [applicationType, setApplicationType] = useState('new');
    const pick = useRef(null), cam = useRef(null);
    const add = (list) => {
      const ok = [];
      Array.from(list || []).forEach((f) => {
        if (!OK.test(f.name)) KB.toast(`${f.name}: use PDF, JPG or PNG`, 'error');
        else if (f.size > MAX) KB.toast(`${f.name} is over 20 MB`, 'error');
        else ok.push(f);
      });
      if (ok.length) setFiles((l) => l.concat(ok));
    };
    // The AI call lives in KB.ai (js/ai/). This component only hands it the files and reacts to the result.
    const start = async () => {
      setBusy(true);
      try {
        const previous = held ? { sig: held.sig, attempts: held.attempts, findings: held.findings } : null;
        const result = await KB.ai.analyze({ files, previous, applicationType, onProgress: setProgress });
        const ref = KB.store.addScanned(files.map((f) => f.name), result, held ? held.ref : undefined);
        const done = Q.find(KB.store.get().apps, ref);
        KB.toast('Local assessment saved. Human review is required.');
        location.hash = consumer ? `#/my-reports/${ref}` : `#/applications/${ref}/check`;
      } catch (err) {
        KB.toast(err.message || 'The AI check failed. Please try again.', 'error');
        setBusy(false); // keep the files so the user can retry
      }
    };
    const input = (ref, extra) => h('input', Object.assign({ ref, type: 'file', className: 'hidden', 'aria-hidden': 'true', tabIndex: -1, onChange: (e) => { add(e.target.files); e.target.value = ''; } }, extra));
    const pending = Q.visible(apps).filter((a) => Q.group(a) !== 'processed').slice(0, 3);

    const zone = h('div', { className: cx('rounded-2xl border-2 border-dashed px-6 py-12 text-center transition', drag ? 'border-brand bg-brand-soft' : 'border-brand/50 bg-brand-softer'),
      onDragOver: (e) => { e.preventDefault(); setDrag(true); }, onDragLeave: () => setDrag(false), onDrop: (e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); } },
      t('span', 'mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-2xl text-brand', Icon('file-arrow-up')),
      t('p', 'mt-4 text-xl font-bold text-navy', 'Drop files here or click to upload'),
      t('p', 'mt-1 text-sm text-slate2', 'PDF, JPG, PNG · up to 20 MB each'),
      t('div', 'mt-5', h(KB.Btn, { onClick: () => pick.current.click(), icon: 'upload' }, 'Browse Files')));

    const list = files.length > 0 && t('ul', 'mt-5 space-y-2', ...files.map((f, i) => h('li', { key: f.name + i, className: 'flex items-center gap-3 rounded-xl border border-line px-4 py-3' },
      Icon('file-lines', 'text-slate2'), t('span', 'min-w-0 flex-1 truncate text-sm font-semibold text-navy', f.name), t('span', 'text-xs text-slate2', kb(f.size)),
      h('button', { onClick: () => setFiles((l) => l.filter((_, k) => k !== i)), disabled: busy, 'aria-label': `Remove ${f.name}`, className: 'grid h-8 w-8 place-items-center rounded-full text-slate2 hover:bg-navy-50' }, Icon('xmark')))));

    const row = (a) => {
      const n = Q.note(a), flagged = Q.group(a) === 'flagged';
      return h('div', { key: a.ref, className: 'grid grid-cols-[1fr_auto] items-center gap-4 border-t border-line px-6 py-4 sm:grid-cols-[1fr_120px_150px_90px]' },
        t('div', 'flex min-w-0 items-center gap-3', t('span', 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy', Icon('file-lines')),
          t('div', 'min-w-0', t('p', 'font-bold text-navy', a.ref), t('p', cx('truncate text-xs', flagged ? 'text-danger' : 'text-slate2'), flagged ? `Flagged · ${n.text}` : a.type))),
        t('span', 'hidden text-sm text-slate2 sm:block', Q.ago(a.agoMin)), t('span', 'hidden sm:block', h(KB.Badge, { kind: a.status, label: flagged ? 'Flagged' : 'Pending review' })),
        h('a', { href: `#/applications/${a.ref}/check`, className: 'justify-self-end rounded-lg border border-line px-4 py-2 text-sm font-semibold text-brand-dark hover:border-brand' }, 'Select'));
    };

    return h(KB.Shell, { active: 'scan' }, KB.Container('space-y-6 py-8',
      t('div', 'flex items-start justify-between gap-4',
        t('div', null, t('h1', 'text-[34px] font-bold leading-tight text-navy', consumer ? accent('Scan & Upload', 'Documents') : accent('AI-Assisted', 'Review')),
          t('p', 'mt-1 text-slate2', consumer ? 'Upload or scan your documents. We’ll check them and prepare a report of the findings.' : 'Upload or select an application to start the AI-powered document check.')),
        t('span', 'hidden items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-xs font-bold tracking-wide text-brand-dark sm:flex', Icon('wand-magic-sparkles'), 'AI ASSISTANCE')),
      held && t('div', 'flex items-start gap-3 rounded-2xl bg-danger-soft p-4 text-sm text-danger', Icon('rotate-left', 'mt-0.5'),
        t('p', null, t('span', 'font-semibold', `Resubmitting ${held.ref}. `), 'Your earlier upload had inconsistencies, so no receipt was issued. Upload your corrected documents below and we’ll check them again.')),
      KB.Card('overflow-hidden',
        t('div', 'border-b border-line px-6 py-5', h(Steps, { n: 1, wide: true })),
        t('div', 'p-6', h('label', { className: 'mb-4 block text-sm font-semibold text-navy' }, 'Application type', h('select', { value: applicationType, disabled: busy, onChange: e => setApplicationType(e.target.value), className: 'ml-3 rounded-lg border border-line p-2 bg-white' }, h('option', { value: 'new' }, 'New application'), h('option', { value: 'renewal' }, 'Renewal'))), zone, list,
          t('div', 'mt-4 flex flex-wrap items-center justify-between gap-3',
            t('span', 'flex items-center gap-2 text-xs text-slate2', Icon('lock'), 'Your documents are securely uploaded for review.'),
            h('button', { onClick: () => cam.current.click(), className: 'flex items-center gap-2 text-sm font-semibold text-brand-dark hover:underline' }, Icon('expand'), 'Scan a document instead', Icon('arrow-right', 'text-xs'))),
          files.length > 0 && t('div', 'mt-5', busy
            ? t('div', 'rounded-xl bg-brand-softer p-4', h('p', { role: 'status', 'aria-live': 'polite', className: 'mb-3 flex items-center gap-2 text-sm font-semibold text-navy' }, Icon('wand-magic-sparkles', 'text-brand'), progress),
              t('div', 'h-2 overflow-hidden rounded-full bg-line', t('div', 'kb-progress h-full w-1/3 rounded-full bg-brand')))
            : h(KB.Btn, { onClick: start, icon: 'wand-magic-sparkles', full: true, size: 'lg' }, `${consumer ? (held ? 'Resubmit & check' : 'Upload & check') : 'Start AI check'} (${files.length} file${files.length > 1 ? 's' : ''})`)),
          input(pick, { accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', multiple: true }), input(cam, { accept: 'image/*', capture: 'environment' }))),
      consumer ? null : KB.Card('overflow-hidden',
        t('div', 'flex items-start justify-between gap-4 p-6', t('div', null, t('h2', 'text-xl font-bold text-navy', 'Or select a pending application'), t('p', 'mt-1 text-sm text-slate2', 'Choose an existing application to begin the AI check.')),
          h('a', { href: '#/applications', className: 'text-sm font-semibold text-brand-dark hover:underline' }, 'See all →')),
        t('div', 'hidden grid-cols-[1fr_120px_150px_90px] gap-4 bg-mist px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate2 sm:grid', t('span', null, 'Application / Type'), t('span', null, 'Submitted'), t('span', null, 'Status'), t('span', 'text-right', 'Action')),
        pending.length ? t('div', null, ...pending.map(row)) : t('p', 'border-t border-line p-8 text-center text-sm text-slate2', 'No pending applications.')),
      t('p', 'flex items-center justify-center gap-2 text-xs text-slate2', Icon('shield-halved'), 'AI assists your review. Final decisions remain with the permit reviewer.')));
  };

  /* ---------- Step 2: requirements check ---------- */
  KB.reqDocs = reqDocs;
  function reqDocs(a) {
    const list = a.docs.map((d) => {
      const linked = a.findings.filter(f => f.a.file === d || f.b.file === d);
      const issues = linked.filter(f => ['confirmed_rule_violation', 'potential_inconsistency'].includes(f.verificationStatus));
      return { file: d, name: slug(d), pages: a.analysis.documents.find(x => x.file === d)?.pages || 0, n: issues.length, checks: linked.length - issues.length, miss: false };
    });
    const missing = ((a.analysis && a.analysis.missingDocuments) || []).map((m) => ({ file: m, name: slug(m), pages: 0, n: 0, miss: true }));
    // Older assessments also stored uncertain recognition under missingDocuments. Display them honestly without changing the saved record.
    const uncertain = (a.analysis.unverifiedDocuments || []).map(m => ({ file: m.label, name: m.label, pages: 0, n: 0, checks: 1, miss: false, unverified: true }));
    const filtered = missing.filter(m => !uncertain.some(u => u.name === m.name));
    return list.concat(filtered, uncertain);
  }
  const pill = (cls, text) => t('span', cx('rounded-md px-3 py-1 text-xs font-semibold', cls), text);

  KB.pages.Check = function Check({ appRef }) {
    const a = Q.find(KB.useStore((s) => s.apps), appRef);
    if (!a) return notFound(appRef);
    const docs = reqDocs(a), got = a.docs.length;
    const issues = a.findings.filter(f => ['confirmed_rule_violation', 'potential_inconsistency'].includes(f.verificationStatus));
    const checks = a.findings.length - issues.length;
    return h(KB.Shell, { active: 'applications' }, KB.Container('space-y-6 py-8', h(AppHead, { a, n: 2 }),
      KB.Card('overflow-hidden', cardHead('Requirements', 'Check', `${a.ref} · ${a.type}`, 'file-circle-check'),
        t('div', 'border-t border-line px-6 py-4',
          t('p', 'font-semibold text-navy', `${got} documents uploaded · ${issues.length} compliance issue${issues.length === 1 ? '' : 's'} · ${checks} verification check${checks === 1 ? '' : 's'}`),
          t('p', 'mt-2 text-sm text-slate2', 'Verification checks describe unreadable, unrecognized, or unverified information. They do not mean the applicant submitted incorrect information. One issue may reference several documents.')),
        t('div', 'border-t border-line px-6 pb-6 pt-5', t('p', 'mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate2', 'Uploaded documents and required checks'),
          ...docs.map((d) => {
            const bad = d.miss || d.n > 0;
            return t('div', 'flex items-center gap-4 border-t border-line py-3.5',
              t('span', cx('grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm', bad ? 'bg-danger-soft text-danger' : d.checks > 0 ? 'bg-navy-50 text-navy' : 'bg-ok-soft text-ok'), Icon(bad ? 'triangle-exclamation' : d.checks > 0 ? 'circle-question' : 'circle-check')),
              t('span', 'min-w-0 flex-1', t('span', 'block font-semibold text-navy', d.name), t('span', 'block truncate text-xs text-slate2', d.miss ? 'Not found in uploaded documents' : d.unverified ? 'Document recognition needs verification; absence is not confirmed' : `${d.file} · ${d.pages} page${d.pages > 1 ? 's' : ''}`)),
              t('div', 'flex flex-wrap gap-2', d.miss ? pill('bg-danger-soft text-danger', 'Missing') : d.n ? pill('bg-danger-soft text-danger', `${d.n} issue${d.n > 1 ? 's' : ''}`) : pill(d.unverified ? 'bg-navy-50 text-navy' : 'bg-ok-soft text-ok', d.unverified ? 'Unverified' : 'Uploaded'),
                d.checks > 0 && pill('bg-navy-50 text-navy', `${d.checks} verification check${d.checks === 1 ? '' : 's'}`)));
          }),
          t('div', 'mt-4', h(KB.Btn, { href: `/applications/${a.ref}/fields`, icon: 'expand', full: true, size: 'lg' }, 'View Extracted Fields'))))));
  };

  /* ---------- Step 3: extracted fields ---------- */
  function fieldsFor(a, d) {
    const ex = a.analysis && a.analysis.documents.find((x) => x.file === d);
    return ex && ex.fields.length ? ex.fields.map((f) => ({ l: f.label, v: f.value == null ? f.raw ? `${f.raw} (needs verification)` : f.required ? 'Not extracted — required field' : 'Not extracted — optional field' : f.value,
      p: f.page, flag: !!f.flagged, quote: f.quote, sourceUrl: f.sourceUrl, documentUrl: f.documentUrl || ex.sourceUrl, reason: f.reason, missing: f.value == null && !f.raw }))
      : [{ l: 'Extraction', v: 'No fields have been extracted. Inspect the original document.', p: null, flag: true, missing: true, documentUrl: ex && ex.sourceUrl }];
  }

  KB.pages.Fields = function Fields({ appRef }) {
    const a = Q.find(KB.useStore((s) => s.apps), appRef);
    const [tab, setTab] = useState(0);
    if (!a) return notFound(appRef);
    const docs = a.docs, d = docs[Math.min(tab, docs.length - 1)], rows = fieldsFor(a, d);
    const dot = (c, l) => t('span', 'flex items-center gap-2', t('span', cx('h-2 w-2 rounded-full', c)), l);
    return h(KB.Shell, { active: 'applications' }, KB.Container('space-y-6 py-8', h(AppHead, { a, n: 3 }),
      KB.Card('overflow-hidden', cardHead('Extracted', 'Fields', `${slug(d)} · ${a.analysis.documents.find(x => x.file === d)?.pages || 0} page(s)`, 'file-lines'),
        h('div', { role: 'tablist', className: 'kb-scroll-x flex gap-2 border-y border-line px-6 py-3' }, ...docs.map((x, i) => h('button', { key: x, role: 'tab', 'aria-selected': i === tab, onClick: () => setTab(i),
          className: cx('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition', i === tab ? 'bg-navy text-white' : 'text-slate2 hover:text-navy') }, slug(x)))),
        t('div', null, ...rows.map((r) => t('div', cx('flex items-center justify-between gap-4 border-b border-line px-6 py-3.5', r.flag && 'bg-danger-soft'),
          t('div', 'min-w-0', t('p', 'text-xs text-slate2', r.l), t('p', 'font-bold text-navy', r.v), r.quote && t('p', 'mt-1 text-xs text-slate2', `Evidence: ${r.quote}`), r.reason && t('p', 'mt-1 text-xs text-slate2', r.reason)),
          t('div', 'flex shrink-0 items-center gap-3 text-xs text-slate2',
            r.sourceUrl ? h('a', { href: r.sourceUrl, target: '_blank', rel: 'noreferrer', className: 'font-semibold text-brand-dark underline' }, `Open page ${r.p}`)
              : r.documentUrl ? h('a', { href: r.documentUrl, target: '_blank', rel: 'noreferrer', className: 'font-semibold text-brand-dark underline' }, 'Inspect document') : 'Document reference not recorded',
            t('span', cx('grid h-7 w-7 place-items-center rounded-full', r.flag ? 'bg-danger-soft text-danger' : r.missing ? 'bg-navy-50 text-slate2' : 'bg-ok-soft text-ok'), Icon(r.flag ? 'triangle-exclamation' : r.missing ? 'circle-question' : 'circle-check', 'text-xs')))))),
        t('div', 'flex gap-6 px-6 py-3 text-xs text-slate2', dot('bg-ok', 'Grounded in document text'), dot('bg-danger', 'Needs verification')),
        t('div', 'px-6 pb-6', h(KB.Btn, { href: `/applications/${a.ref}`, icon: 'triangle-exclamation', full: true, size: 'lg' }, `View Findings (${a.findings.length})`),
          t('p', 'mt-4 text-xs text-slate2', 'Only fields configured for this document type are shown. Extracted values link to their source page. A field marked not extracted needs inspection; it is not proof the document omits that information.')))));
  };
})();
