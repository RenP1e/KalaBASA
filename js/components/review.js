// Finding review: compare two source excerpts, then confirm / dismiss / escalate.
(function () {
  const { h, t, cx, Icon } = KB;
  const { useState } = React;
  const Q = KB.Q;

  function Segs({ segs, big }) {
    return t('p', cx('font-bold text-navy', big ? 'text-[26px] leading-snug' : 'text-xl'),
      ...segs.map((s, i) => h('span', { key: i, className: s.hl ? 'text-brand' : undefined }, s.t)));
  }

  function SourceCard({ src, onOpen }) {
    return KB.Card('flex flex-col p-6',
      t('div', 'flex items-start justify-between gap-3',
        t('div', 'flex items-center gap-3',
          t('span', 'grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy-50 text-lg text-navy', Icon('file-lines')),
          t('div', null, t('p', 'font-bold text-navy', src.file), t('p', 'text-xs text-slate2', src.meta))),
        h('button', { onClick: onOpen, 'aria-label': `Open ${src.file}`, className: 'grid h-9 w-9 place-items-center rounded-full text-navy hover:bg-navy-50' }, Icon('arrow-up-right-from-square'))),
      t('div', 'mt-5 flex-1 rounded-xl bg-brand-soft p-5',
        t('p', 'mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate2', src.label),
        h(Segs, { segs: src.segs, big: true }), t('p', 'mt-3 text-sm text-slate2', src.sub)),
      t('div', 'mt-4 flex items-center justify-between text-sm',
        h('button', { onClick: onOpen, className: 'flex items-center gap-2 font-semibold text-navy hover:underline' }, Icon('arrow-up-right-from-square', 'text-xs'), 'Open source page'),
        t('span', 'text-xs text-slate2', src.page ? `Page ${src.page}` : 'Source unavailable')));
  }

  function SourceModal({ src, onClose }) {
    if (src.sourceUrl) return h(KB.Modal, { title: src.file, onClose, wide: true },
      h('img', { src: src.sourceUrl, alt: `Original source page ${src.page} of ${src.file}`, className: 'w-full rounded-xl border border-line' }),
      t('p', 'mt-3 text-sm text-slate2', src.quote || 'Compare the finding with this original page.'));
    return h(KB.Modal, { title: src.file, onClose, wide: true },
      t('p', 'mb-4 text-sm text-slate2', 'No source page is available for this checklist or manual-verification finding.'),
      h(Segs, { segs: src.segs }));
  }

  KB.pages.Review = function Review({ appRef, n }) {
    const s = KB.useStore();
    const a = Q.find(s.apps, appRef);
    const i = parseInt(n, 10) - 1;
    const [src, setSrc] = useState(null);
    const f = a && a.findings[i];
    if (!f) return h(KB.Shell, { active: 'applications' }, h(KB.Empty, { title: 'Finding not found', text: 'This finding does not exist or was removed.', href: '/applications' }));
    const total = a.findings.length;

    const record = async (outcome) => {
      try {
      await KB.store.reviewFinding(appRef, i, outcome);
      KB.toast({ confirmed: 'Finding confirmed', dismissed: 'Finding dismissed', escalated: 'Finding escalated to supervisor' }[outcome]);
      const fresh = Q.find(KB.store.get().apps, appRef);
      const nxt = Q.firstOpenIdx(fresh);
      if (nxt >= 0) location.hash = `#/applications/${appRef}/finding/${nxt + 1}`;
      else { KB.toast('All findings reviewed'); location.hash = `#/applications/${appRef}`; }
      } catch (error) { KB.toast(error.message, 'error'); }
    };
    const decide = (key, label, variant, icon) => h(KB.Btn, { key, variant: f.status === key ? 'selected' : variant, onClick: () => record(key), full: true, icon: f.status === key ? 'check' : undefined }, label);

    return h(KB.Shell, { active: 'applications' },
      h(KB.Hero, {
        crumbs: [{ label: 'Applications', href: '/applications' }, { label: a.ref, href: '/applications/' + a.ref }, { label: `Finding ${i + 1} of ${total}` }],
        title: 'Finding review', sub: `${a.ref} · Finding ${i + 1} of ${total}`,
        actions: [h(KB.Btn, { key: 1, href: '/applications/' + a.ref }, 'View application'), h(KB.Btn, { key: 2, href: '/applications', variant: 'ghost' }, 'Back to applications')],
      }),
      KB.Container('py-8',
        t('div', 'flex flex-wrap items-end justify-between gap-4',
          t('div', null, t('p', 'text-sm font-medium text-slate2', a.name), t('h2', 'mt-1 text-[32px] font-bold leading-tight text-navy', f.title)),
          h(KB.Badge, { kind: f.status })),
        total > 1 && t('div', 'mt-3 flex gap-4 text-sm font-semibold text-navy',
          i > 0 && h('a', { href: `#/applications/${appRef}/finding/${i}`, className: 'hover:underline' }, '← Previous finding'),
          i < total - 1 && h('a', { href: `#/applications/${appRef}/finding/${i + 2}`, className: 'hover:underline' }, 'Next finding →')),
        t('div', 'mt-6 grid gap-6 md:grid-cols-2', h(SourceCard, { src: f.a, onOpen: () => setSrc(f.a) }), h(SourceCard, { src: f.b, onOpen: () => setSrc(f.b) })),
        t('div', 'mt-6 grid gap-6 lg:grid-cols-3',
          t('div', 'rounded-2xl bg-brand-soft p-7 lg:col-span-2',
            t('h3', 'flex items-center gap-3 text-xl font-bold text-navy', Icon('wand-magic-sparkles', 'text-brand'), 'Why this was flagged'),
            s.settings.ai
              ? t('p', 'mt-4 text-[17px] leading-relaxed text-navy', f.why)
              : t('p', 'mt-4 text-[17px] leading-relaxed text-navy', 'AI-assisted checks are turned off. ', h('a', { href: '#/profile', className: 'font-semibold underline' }, 'Turn them on in Profile'), ' to see why this was flagged. Compare the two sources above to decide.'),
            s.settings.ai && t('div', 'mt-5 flex flex-wrap gap-2', ...f.tags.map((g, k) => h('span', { key: k, className: cx('rounded-full px-4 py-1.5 text-xs font-semibold', g.tone === 'warn' ? 'text-brand-dark' : 'bg-navy-50 text-navy') }, g.t)))),
          KB.Card('p-6',
            t('h3', 'mb-4 text-xl font-bold text-navy', 'Record your review'),
            t('div', 'space-y-3', decide('confirmed', 'Confirm finding', 'primary'), t('div', 'grid grid-cols-2 gap-3', decide('dismissed', 'Dismiss', 'outline'), decide('escalated', 'Escalate', 'outline'))),
            t('p', 'mt-4 text-xs leading-relaxed text-slate2', 'This records your finding review, not a permit decision. Only authorized LGU personnel decide applications.')))),
      src && h(SourceModal, { src, onClose: () => setSrc(null) }));
  };
})();
