// Applications queue + single-application detail.
(function () {
  const { h, t, cx, Icon } = KB;
  const { useState } = React;
  const Q = KB.Q;

  const ICON = {
    pending: ['file-lines', 'bg-navy-50 text-navy'], processed: ['circle-check', 'bg-ok-soft text-ok'],
    flagged: ['triangle-exclamation', 'bg-danger-soft text-danger'], returned: ['rotate-left', 'bg-brand-soft text-brand-dark'],
  };
  const iconFor = (a) => ICON[a.status === 'Returned' ? 'returned' : Q.group(a)];

  function AppCard({ a }) {
    const [name, box] = iconFor(a);
    const n = Q.note(a);
    return h('a', { href: '#/applications/' + a.ref, className: 'group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift' },
      t('div', 'flex items-center justify-between gap-3', t('span', 'min-w-0 truncate text-sm font-bold text-navy', a.ref), t('span', 'shrink-0', h(KB.Badge, { kind: a.status }))),
      t('div', 'mt-5 flex items-center gap-4',
        t('span', cx('grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg', box), Icon(name)),
        h('span', { title: a.name, className: 'line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere] text-xl font-bold leading-snug text-navy' }, a.name)),
      h('p', { title: n.text, className: cx('mt-5 line-clamp-2 min-h-[20px] [overflow-wrap:anywhere] text-sm', n.tone === 'danger' ? 'text-danger' : 'text-slate2') }, n.text),
      t('div', 'mt-5 flex items-center justify-between border-t border-line pt-4 text-sm',
        t('span', 'text-xs text-slate2', Q.ago(a.agoMin)),
        t('span', 'flex shrink-0 items-center gap-1 font-semibold text-navy', 'View application', Icon('chevron-right', 'text-xs transition group-hover:translate-x-0.5'))));
  }

  KB.pages.Applications = function Applications() {
    const apps = Q.visible(KB.useStore((s) => s.apps));
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [type, setType] = useState('all');
    const [panel, setPanel] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const c = Q.counts(apps);
    const q = query.trim().toLowerCase();
    const filtered = apps.filter((a) => (filter === 'all' || Q.group(a) === filter)
      && (type === 'all' || a.type === type)
      && (!q || a.name.toLowerCase().includes(q) || a.ref.toLowerCase().includes(q)));
    const narrowed = filter !== 'all' || q || type !== 'all';
    const limit = showAll || narrowed ? 24 : 5;
    const shown = filtered.slice(0, limit);
    const next = Q.nextRoute(apps);

    const chip = (key, label, count) => h('button', { key, onClick: () => { setFilter(key); setShowAll(false); }, 'aria-pressed': filter === key,
      className: cx('h-11 whitespace-nowrap rounded-full border px-5 text-sm font-semibold transition', filter === key ? 'border-navy bg-navy text-white' : 'border-line bg-white text-navy hover:border-navy') },
      label, count !== undefined && t('span', 'ml-1.5 font-medium', count));
    const typeChip = (key, label) => h('button', { key, onClick: () => setType(key), className: cx('rounded-full border px-4 py-1.5 text-sm font-semibold', type === key ? 'border-navy bg-navy text-white' : 'border-line text-navy') }, label);

    return h(KB.Shell, { active: 'applications' },
      h(KB.Hero, {
        crumbs: [{ label: 'Reviewer workspace' }, { label: 'Applications' }],
        title: 'Applications', sub: `${c.total} total · ${KB.APP.office} · Updated just now`,
        actions: [
          next ? h(KB.Btn, { key: 1, href: next }, 'Review next application') : h(KB.Btn, { key: 1, onClick: () => KB.toast('Queue is clear. Nice work!') }, 'Review next application'),
          h(KB.Btn, { key: 2, href: '/reports', variant: 'ghost' }, 'View reports'),
        ],
      }),
      KB.Container('py-8',
        t('div', 'flex flex-col gap-4 lg:flex-row lg:items-center',
          t('div', 'relative flex-1',
            Icon('magnifying-glass', 'pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate2'),
            h('input', { value: query, onChange: (e) => { setQuery(e.target.value); setShowAll(false); }, type: 'search', 'aria-label': 'Search applications', placeholder: 'Search business or reference no.',
              className: 'h-[52px] w-full rounded-full border border-line bg-white pl-12 pr-14 text-[15px] text-navy shadow-card placeholder:text-slate2 focus:border-navy focus:outline-none' }),
            h('button', { onClick: () => setPanel(!panel), 'aria-label': 'Filters', 'aria-expanded': panel, className: cx('absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full hover:bg-navy-50', type !== 'all' ? 'text-brand' : 'text-navy') }, Icon('sliders'))),
          t('div', 'kb-scroll-x flex gap-3', chip('all', 'All'), chip('pending', 'Pending', c.pending), chip('processed', 'Processed', c.processed), chip('flagged', 'Flagged', c.flagged))),
        panel && t('div', 'kb-pop mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-4',
          t('span', 'mr-2 text-sm font-semibold text-navy', 'Permit type'), typeChip('all', 'All'), typeChip('New permit', 'New permit'), typeChip('Renewal', 'Renewal')),
        t('div', 'mb-5 mt-9 flex items-center justify-between', t('h2', 'text-xl font-bold text-navy', 'Application queue'), t('span', 'text-sm text-slate2', 'Most recent applications')),
        shown.length
          ? t('div', 'grid gap-5 md:grid-cols-2 lg:grid-cols-3', ...shown.map((a) => h(AppCard, { key: a.ref, a })))
          : KB.Card('p-10 text-center text-slate2', 'No applications match your search.'),
        t('div', 'mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center',
          t('p', 'text-sm text-slate2', narrowed ? `Showing ${shown.length} of ${filtered.length} matching applications` : `Showing ${shown.length} recent applications of ${c.total} total`),
          !narrowed && filtered.length > limit && h(KB.Btn, { variant: 'outline', size: 'lg', onClick: () => setShowAll(true) }, 'View all applications'),
          !narrowed && showAll && h(KB.Btn, { variant: 'outline', size: 'lg', onClick: () => setShowAll(false) }, 'Show fewer'))));
  };

  /* ---------- Application detail ---------- */
  const row = (label, value) => t('div', 'flex items-start justify-between gap-6 border-b border-line py-3.5 last:border-0', t('span', 'shrink-0 text-sm text-slate2', label), t('span', 'min-w-0 text-right [overflow-wrap:anywhere] text-sm font-semibold text-navy', value));

  KB.pages.ApplicationDetail = function ApplicationDetail({ appRef: ref }) {
    const apps = KB.useStore((s) => s.apps);
    const a = Q.find(apps, ref);
    if (!a) return h(KB.Shell, { active: 'applications' }, h(KB.Empty, { title: 'Application not found', text: `We couldn’t find ${ref}.`, href: '/applications' }));
    const open = Q.open(a).length;
    const confirmed = a.findings.filter((f) => f.status === 'confirmed').length;
    const escalated = a.findings.filter((f) => f.status === 'escalated').length;
    const idx = Q.firstOpenIdx(a);

    const act = async (fn, msg) => { try { await fn(ref); KB.toast(msg); if (Q.find(KB.store.get().apps, ref).decision) location.hash = `#/applications/${ref}/outcome`; } catch (error) { KB.toast(error.message, 'error'); } };
    let panel;
    if (!['assessment_completed', 'manual_review_required', 'local_ai_unavailable'].includes(a.processingState)) {
      panel = [t('p', 'text-sm text-slate2', 'Local processing is in progress. Findings and review actions appear when processing finishes.')];
    } else if (['queued', 'transmitted'].includes(a.transmissionState)) {
      panel = [t('p', 'text-sm text-slate2', 'This submission is saved for LGU delivery. Official LGU review takes place at the receiving installation.')];
    } else if (a.decision) {
      panel = [t('p', 'text-sm text-slate2', a.decision.type === 'approved' ? 'This application was approved by the authorized LGU officer.' : 'This application was returned for correction.'),
        h(KB.Btn, { key: 'b', href: `/applications/${ref}/outcome`, variant: 'outline', full: true }, 'View decision')];
    } else if (open) {
      panel = [t('p', 'text-sm text-slate2', `${open} finding${open > 1 ? 's' : ''} still need${open > 1 ? '' : 's'} your review before this application can move on.`),
        h(KB.Btn, { key: 'b', href: `/applications/${ref}/finding/${idx + 1}`, full: true }, 'Review next finding')];
    } else if (confirmed) {
      panel = [t('p', 'text-sm text-slate2', `${confirmed} confirmed finding${confirmed > 1 ? 's' : ''} will be attached to the correction request sent to the applicant.`),
        h(KB.Btn, { key: 'b', full: true, icon: 'rotate-left', onClick: () => act(KB.store.returnApplication, 'Application returned for correction') }, 'Return for correction')];
    } else if (escalated) {
      panel = [t('p', 'text-sm text-slate2', `${escalated} escalated finding${escalated > 1 ? 's are' : ' is'} with your supervisor. Decisions stay with authorized LGU personnel.`)];
    } else {
      panel = [t('p', 'text-sm text-slate2', 'An authorized reviewer must inspect the documents before recording an official decision.'),
        h(KB.Btn, { key: 'b', full: true, icon: 'check', onClick: () => act(KB.store.forwardApplication, 'Forwarded. No approval has been recorded.') }, 'Forward for approval'),
        h(KB.DecisionForm, { key: 'decision', app: a })];
    }

    return h(KB.Shell, { active: 'applications' },
      h(KB.Hero, {
        crumbs: [{ label: 'Applications', href: '/applications' }, { label: a.ref }], title: a.name, sub: `${a.type} · ${a.ref} · ${Q.ago(a.agoMin)}`,
        actions: [a.decision ? h(KB.Btn, { key: 1, href: `/applications/${ref}/outcome` }, 'View decision') : (open ? h(KB.Btn, { key: 1, href: `/applications/${ref}/finding/${idx + 1}` }, 'Review next finding') : null),
          h(KB.Btn, { key: 3, href: `/applications/${ref}/check`, variant: 'ghost' }, 'Requirements check'),
          h(KB.Btn, { key: 2, href: '/applications', variant: 'ghost' }, 'Back to applications')].filter(Boolean),
        aside: t('div', 'hidden md:block', h(KB.Badge, { kind: a.status })),
      }),
      KB.Container('grid gap-6 py-10 lg:grid-cols-3',
        t('div', 'space-y-6 lg:col-span-2',
          h(KB.AssessmentStatus, { app: a }),
          KB.Card('p-6', t('h2', 'mb-2 text-xl font-bold text-navy', 'Application details'),
            row('Reference no.', a.ref), row('Business', a.name), row('Permit type', a.type), row('Applicant', a.owner), row('Business address', a.address), row('Submitted', a.submitted),
            a.submittedBy && row('Documents', `${a.docs.length} uploaded`),
            a.submissionReceipt && row('Submission receipt', a.submissionReceipt)),
          KB.Card('p-6', t('h2', 'mb-4 text-xl font-bold text-navy', `Findings (${a.findings.length})`),
            a.findings.length
              ? t('div', 'space-y-3', ...a.findings.map((f, i) => h('a', { key: i, href: `#/applications/${ref}/finding/${i + 1}`, className: 'flex items-center gap-4 rounded-xl border border-line p-4 transition hover:border-navy' },
                t('span', cx('grid h-10 w-10 shrink-0 place-items-center rounded-lg', f.status === 'awaiting' ? 'bg-brand-soft text-brand-dark' : 'bg-navy-50 text-navy'), Icon('triangle-exclamation')),
                t('span', 'min-w-0 flex-1', t('span', 'block [overflow-wrap:anywhere] font-semibold text-navy', f.title), t('span', 'block text-xs text-slate2', `Finding ${i + 1} of ${a.findings.length}`)),
                h(KB.Badge, { kind: f.status }), Icon('chevron-right', 'text-navy'))))
              : t('p', 'text-sm text-slate2', 'No findings were raised for this application.'))),
        t('div', 'space-y-6',
          KB.Card('p-6', t('h2', 'mb-4 text-xl font-bold text-navy', 'Next step'), t('div', 'space-y-4', ...panel)),
          KB.Card('p-6', t('h2', 'mb-4 text-xl font-bold text-navy', 'Documents'),
            t('ul', 'space-y-3', ...a.docs.map((d) => h('li', { key: d, className: 'flex items-center gap-3 text-sm text-navy' }, Icon('file-lines', 'shrink-0 text-slate2'), t('span', 'min-w-0 [overflow-wrap:anywhere]', d))))))));
  };
})();
