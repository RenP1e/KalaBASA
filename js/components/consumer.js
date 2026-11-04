// Consumer (applicant) pages: their own findings reports only. Read-only; no reviewer actions.
(function () {
  const { h, t, cx, Icon } = KB;
  const accent = (a, b) => t('span', null, a + ' ', t('span', 'text-brand', b));
  const Q = KB.Q;
  const mine = (apps) => apps.filter((a) => a.submittedBy && a.submittedBy === KB.USER.email);


  /* ---------- Submission receipt (issued once the submission is complete) ---------- */
  const rrow = (label, value) => t('div', 'flex items-baseline justify-between gap-4 py-1.5 text-sm', t('dt', 'text-slate2', label), t('dd', 'min-w-0 text-right font-semibold text-navy [overflow-wrap:anywhere]', value));

  function ReceiptCard({ a }) {
    const when = a.completedStamp ? `${a.completedStamp.date} · ${a.completedStamp.time}` : a.submitted;
    return KB.Card('overflow-hidden',
      h('div', { id: 'kb-receipt', className: 'p-6 sm:p-8' },
        t('div', 'flex flex-wrap items-start justify-between gap-3',
          t('div', null, t('p', 'text-xs font-semibold uppercase tracking-[0.14em] text-slate2', KB.APP.office), t('h2', 'mt-1 text-2xl font-bold text-navy', 'Submission Receipt')),
          t('span', 'inline-flex items-center gap-2 rounded-full bg-ok-soft px-3 py-1 text-xs font-semibold text-ok', Icon('circle-check'), 'Submission complete')),
        t('p', 'mt-3 text-sm text-slate2', 'This confirms that your documents were received in full and are now on the reviewer’s dashboard. Keep this receipt for your records.'),
        t('dl', 'mt-5 border-y border-dashed border-navy-300 py-3',
          rrow('Receipt no.', t('span', 'font-mono tracking-wider', a.receiptNo)), rrow('Reference no.', a.ref), rrow('Applicant', a.owner),
          rrow('Business', a.name), rrow('Permit type', a.type), rrow('Received', when)),
        t('div', 'mt-5', t('p', 'mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate2', `Documents received (${a.docs.length})`),
          t('ul', null, ...a.docs.map((d, i) => h('li', { key: d + i, className: 'flex items-center gap-3 border-t border-line py-2.5 text-sm' },
            t('span', 'text-ok', Icon('circle-check')), t('span', 'min-w-0 flex-1 truncate font-semibold text-navy', d), t('span', 'text-xs font-semibold text-ok', 'Received'))))),
        t('p', 'mt-5 border-t border-dashed border-navy-300 pt-4 text-center text-xs text-slate2', `${KB.DISCLAIMER}`)),
      t('div', 'flex flex-wrap gap-3 border-t border-line bg-mist px-6 py-4 sm:px-8',
        h(KB.Btn, { icon: 'print', onClick: () => window.print() }, 'Print / Save as PDF'),
        h(KB.Btn, { variant: 'outline', icon: 'copy', onClick: () => { try { navigator.clipboard.writeText(a.receiptNo); KB.toast('Receipt number copied'); } catch (e) { KB.toast('Receipt no. ' + a.receiptNo); } } }, 'Copy receipt no.')));
  }

  // What the applicant sees as status (reviewer-internal states are not exposed).
  const appStatus = (a) => {
    if (a.transmissionState === 'local_only') return { kind: 'In review', label: 'Local assessment' };
    if (a.transmissionState === 'queued') return { kind: 'Pending', label: 'Submission queued' };
    if (a.held) return { kind: 'Needs review', label: 'Resubmission needed' };
    if (a.decision && a.decision.type === 'approved') return { kind: 'Processed', label: 'Approved' };
    if (a.decision) return { kind: 'Returned', label: 'Returned for correction' };
    if (a.transmissionState === 'received_by_lgu') return { kind: 'In review', label: 'Submitted to LGU' };
    return a.status === 'Pending' ? { kind: 'Pending', label: 'Submitted' } : { kind: 'In review', label: 'Under review' };
  };
  const findingStatus = (f) => (f.status === 'confirmed' ? { kind: 'Needs review', label: 'Needs correction' }
    : f.status === 'dismissed' ? { kind: 'dismissed', label: 'Cleared' } : { kind: 'awaiting', label: 'Under review' });

  const TAG = { warn: 'bg-danger-soft text-danger', info: 'bg-navy-50 text-navy' };
  const source = (s) => t('div', 'rounded-xl border border-line bg-mist p-4',
    t('p', 'text-[11px] font-semibold uppercase tracking-wider text-slate2', `${s.file} · ${s.meta}`),
    t('p', 'mt-2 text-xs text-slate2', s.label),
    t('p', 'mt-0.5 font-bold text-navy', ...s.segs.map((g, i) => h('span', { key: i, className: g.hl ? 'rounded bg-danger-soft px-1 text-danger' : '' }, g.t))),
    s.sub && t('p', 'mt-1 text-xs text-slate2', s.sub));

  function finding(f, i) {
    const st = findingStatus(f);
    return h('div', { key: f.key + i, className: 'rounded-2xl border border-line bg-white p-5' },
      t('div', 'flex flex-wrap items-start justify-between gap-3',
        t('div', 'flex items-start gap-3', t('span', 'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-danger-soft text-danger', Icon('triangle-exclamation')),
          t('h3', 'pt-1 text-lg font-bold text-navy', f.title)),
        h(KB.Badge, { kind: st.kind, label: st.label })),
      t('p', 'mt-3 text-sm text-slate2', f.why),
      t('div', 'mt-3 flex flex-wrap gap-2', ...f.tags.map((g, k) => h('span', { key: k, className: cx('rounded-md px-3 py-1 text-xs font-semibold', TAG[g.tone] || TAG.info) }, g.t))),
      f.a.sourceKind === 'checklist' && f.b.sourceKind === 'checklist'
        ? t('p', 'mt-4 text-xs text-slate2', `Checklist verification · Rule: ${f.ruleId}. No individual document page applies.`)
        : t('div', 'mt-4 grid gap-3 sm:grid-cols-2', source(f.a), source(f.b)));
  }

  /* ---------- My reports (list) ---------- */
  KB.pages.MyReports = function MyReports() {
    const apps = mine(KB.useStore((s) => s.apps));
    const row = (a) => {
      const st = appStatus(a);
      return h('a', { key: a.ref, href: '#/my-reports/' + a.ref, className: 'flex items-center gap-4 px-6 py-4 hover:bg-mist' },
        t('span', 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy', Icon('file-lines')),
        t('span', 'min-w-0 flex-1', t('span', 'block truncate font-bold text-navy', a.name), t('span', 'block text-xs text-slate2', `${a.ref} · Submitted ${a.submitted}`)),
        a.complete && t('span', 'hidden items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-xs font-semibold text-ok md:inline-flex', Icon('receipt'), 'Complete · Receipt ready'),
        a.held && t('span', 'hidden items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-semibold text-danger md:inline-flex', Icon('rotate-left'), 'No receipt yet'),
        t('span', 'hidden text-sm text-slate2 sm:block', `${a.findings.length} finding${a.findings.length === 1 ? '' : 's'}`),
        h(KB.Badge, { kind: st.kind, label: st.label }), Icon('chevron-right', 'text-navy'));
    };
    return h(KB.Shell, { active: 'my-reports' }, KB.Container('space-y-6 py-8',
      t('div', null, t('h1', 'text-[34px] font-bold leading-tight text-navy', accent('My', 'Reports')), t('p', 'mt-1 text-slate2', 'Findings from the documents you scanned and uploaded.')),
      apps.length
        ? KB.Card('divide-y divide-line overflow-hidden', ...apps.map(row))
        : KB.Card('p-10 text-center', t('span', 'mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-navy-50 text-xl text-navy', Icon('file-circle-check')),
          t('h2', 'mt-4 text-xl font-bold text-navy', 'No reports yet'), t('p', 'mt-1 text-slate2', 'Scan or upload a document to get your first findings report.'),
          t('div', 'mt-6', h(KB.Btn, { href: '/scan', icon: 'upload' }, 'Scan a document'))),
      t('p', 'text-center text-xs text-slate2', KB.DISCLAIMER)));
  };

  /* ---------- One findings report ---------- */
  KB.pages.MyReport = function MyReport({ appRef }) {
    const a = mine(KB.useStore((s) => s.apps)).find((x) => x.ref === appRef);
    if (!a) return h(KB.Shell, { active: 'my-reports' }, KB.Container('py-16', KB.Card('p-10 text-center',
      t('h2', 'text-xl font-bold text-navy', 'Report not found'), t('p', 'mt-2 text-slate2', `We couldn’t find a report ${appRef} on your account.`),
      t('div', 'mt-6', h(KB.Btn, { href: '/my-reports', variant: 'outline' }, 'Back to my reports')))));

    const st = appStatus(a), docs = KB.reqDocs(a), n = a.findings.length;
    const stat = (label, value) => KB.Card('p-5', t('p', 'text-sm text-slate2', label), t('p', 'mt-2 text-3xl font-bold text-navy', value));
    const banner = a.decision && (a.decision.type === 'approved'
      ? t('div', 'flex items-center gap-3 rounded-2xl bg-ok-soft p-4 text-sm text-ok', Icon('circle-check'), 'Your application was approved.')
      : t('div', 'flex items-center gap-3 rounded-2xl bg-danger-soft p-4 text-sm text-danger', Icon('rotate-left'), 'Your application was returned for correction. Please review the findings below, then scan and upload the corrected documents.'));

    return h(KB.Shell, { active: 'my-reports' }, KB.Container('space-y-6 py-8',
      t('div', 'flex flex-wrap items-start justify-between gap-4',
        t('div', null, t('p', 'text-xs text-slate2', h('a', { href: '#/my-reports', className: 'hover:underline' }, 'My reports'), ' / ', a.ref),
          t('h1', 'mt-1 text-3xl font-bold text-navy', accent('Findings', 'Report')), t('p', 'mt-1 text-sm text-slate2', `${a.name} · ${a.ref}`)),
        h(KB.Badge, { kind: st.kind, label: st.label })),
      a.complete && h(ReceiptCard, { a }),
      h(KB.AssessmentStatus, { app: a }),
      a.held && KB.Card('overflow-hidden border-danger/40',
        t('div', 'flex flex-wrap items-start justify-between gap-4 p-6',
          t('div', 'flex min-w-0 flex-1 items-start gap-4',
            t('span', 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger', Icon('receipt')),
            t('div', 'min-w-0', t('h2', 'text-xl font-bold text-navy', 'No receipt yet'),
              t('p', 'mt-1 text-sm text-slate2', `All your documents were received, but we found ${n} inconsistenc${n === 1 ? 'y' : 'ies'} in them. Your submission is on hold and has not been sent to the reviewer. Correct the items below, then submit your documents again. Your receipt is issued once the check passes.`),
              (a.attempts || 1) > 1 && t('p', 'mt-2 text-xs font-semibold text-slate2', `Attempt ${a.attempts}`))),
          h(KB.Btn, { href: `/scan/${a.ref}`, icon: 'upload' }, 'Submit documents again'))),
      banner,
      t('div', 'grid gap-4 sm:grid-cols-3', stat('Documents scanned', a.docs.length), stat('Findings', n), stat('Submitted', a.submitted)),
      KB.Card('p-6', t('h2', 'text-xl font-bold text-navy', 'Documents'),
        t('div', 'mt-3', ...docs.map((d) => t('div', 'flex items-center gap-4 border-t border-line py-3',
          t('span', cx('grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm', d.miss ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok'), Icon(d.miss ? 'triangle-exclamation' : 'circle-check')),
          t('span', 'min-w-0 flex-1', t('span', 'block truncate font-semibold text-navy', d.miss ? d.name : d.file), d.miss && t('span', 'block text-xs text-slate2', 'Not found in your uploaded documents')),
          t('span', cx('rounded-md px-3 py-1 text-xs font-semibold', d.miss ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok'), d.miss ? 'Missing' : 'Received'))))),
      t('div', 'space-y-4', t('h2', 'text-xl font-bold text-navy', n ? `Findings (${n})` : 'Findings'),
        n ? t('div', 'space-y-4', ...a.findings.map(finding))
          : KB.Card('flex items-center gap-3 p-6 text-ok', Icon('circle-check', 'text-xl'), t('span', 'font-semibold', 'No findings. Your documents look consistent.'))),
      t('div', 'flex flex-wrap gap-3', a.held ? h(KB.Btn, { href: `/scan/${a.ref}`, icon: 'upload' }, 'Submit documents again') : h(KB.Btn, { href: '/scan', icon: 'upload' }, 'Scan another document'), h(KB.Btn, { href: '/my-reports', variant: 'outline' }, 'All my reports')),
      t('p', 'rounded-2xl bg-navy-50 p-4 text-sm text-navy', Icon('wand-magic-sparkles', 'mr-2'), KB.DISCLAIMER)));
  };
})();
