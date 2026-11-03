(function () {
  const { h, t, cx, Icon } = KB;
  const Q = KB.Q;

  function Stat({ label, value, note, tone, href }) {
    return h('a', { href: '#' + href, className: 'rounded-2xl border border-line bg-white p-6 shadow-card transition hover:shadow-lift' },
      t('p', 'text-sm text-slate2', label), t('p', 'mt-3 text-4xl font-bold text-navy', value),
      t('p', cx('mt-3 text-xs font-medium', tone === 'danger' ? 'text-danger' : tone === 'ok' ? 'text-ok' : 'text-navy'), note));
  }

  KB.pages.Home = function Home() {
    const s = KB.useStore();
    const c = Q.counts(s.apps);
    const week = Q.report(s, 'week');
    const today = Q.report(s, 'today');
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const next = Q.nextRoute(s.apps);
    const attention = Q.visible(s.apps).filter((a) => Q.group(a) !== 'processed').slice(0, 4);
    const done = Q.completed(s.apps);

    return h(KB.Shell, { active: 'home' },
      h(KB.Hero, {
        crumbs: [{ label: 'Reviewer workspace' }, { label: 'Home' }],
        title: `${greet}, ${KB.USER.name.split(' ')[0]}`,
        sub: `${c.pending + c.flagged} applications are waiting for review · ${c.flagged} flagged${done.length ? ` · ${done.length} complete submission${done.length > 1 ? 's' : ''} from applicants` : ''}`,
        actions: [
          next ? h(KB.Btn, { key: 1, href: next }, 'Review next application') : h(KB.Btn, { key: 1, onClick: () => KB.toast('Queue is clear. Nice work!') }, 'Review next application'),
          h(KB.Btn, { key: 2, href: '/applications', variant: 'ghost' }, 'View applications'),
        ],
      }),
      KB.Container('py-10 space-y-8',
        t('div', 'grid gap-5 sm:grid-cols-2 lg:grid-cols-4',
          h(Stat, { label: 'Waiting for review', value: c.pending, note: 'Pending and in review', href: '/applications' }),
          h(Stat, { label: 'Flagged', value: c.flagged, note: c.flagged ? 'Needs your attention' : 'Nothing flagged', tone: c.flagged ? 'danger' : 'ok', href: '/applications' }),
          h(Stat, { label: 'Reviewed today', value: today.reviewed, note: today.delta, tone: 'ok', href: '/reports' }),
          h(Stat, { label: 'Avg. active review time', value: week.time, note: week.timeNote, tone: 'ok', href: '/reports' })),
        // Applicant submissions that have every required document (each applicant gets a receipt).
        KB.Card('overflow-hidden',
          t('div', 'flex flex-wrap items-center justify-between gap-3 px-6 py-5',
            t('div', 'flex items-center gap-3',
              t('span', 'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ok-soft text-ok', Icon('circle-check', 'text-lg')),
              t('div', null, t('h2', 'text-xl font-bold text-navy', 'Received LGU submissions'), t('p', 'text-sm text-slate2', 'Transmissions received by this LGU for human review'))),
            t('span', cx('rounded-full px-3 py-1 text-xs font-semibold', done.length ? 'bg-ok-soft text-ok' : 'bg-navy-50 text-slate2'), `${done.length} received`)),
          done.length
            ? t('div', 'divide-y divide-line border-t border-line', ...done.slice(0, 5).map((a) => h('a', { key: a.ref, href: '#/applications/' + a.ref, className: 'flex items-center gap-4 px-6 py-4 transition hover:bg-mist' },
              t('span', 'min-w-0 flex-1', t('span', 'block truncate font-bold text-navy', a.name),
                t('span', 'block truncate text-sm text-slate2', `${a.ref} · ${a.owner} · ${a.completedStamp ? `${a.completedStamp.date}, ${a.completedStamp.time}` : Q.ago(a.agoMin)}`)),
              t('span', 'hidden items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-xs font-semibold text-ok sm:inline-flex', Icon('receipt'), 'Transmission received'),
              h(KB.Badge, { kind: 'Pending', label: 'Human review required' }), Icon('chevron-right', 'text-navy'))))
            : t('p', 'border-t border-line px-6 py-8 text-center text-sm text-slate2', 'No LGU transmissions have been received. Local assessments remain available in Applications.')),
        t('div', 'grid gap-6 lg:grid-cols-3',
          t('div', 'lg:col-span-2',
            t('div', 'mb-4 flex items-center justify-between', t('h2', 'text-xl font-bold text-navy', 'Needs your attention'),
              h('a', { href: '#/applications', className: 'text-sm font-semibold text-navy hover:underline' }, 'See all')),
            attention.length
              ? t('div', 'space-y-3', ...attention.map((a) => {
                const n = Q.note(a);
                return h('a', { key: a.ref, href: '#/applications/' + a.ref, className: 'flex items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-card transition hover:shadow-lift' },
                  t('span', cx('grid h-12 w-12 shrink-0 place-items-center rounded-xl', a.status === 'Needs review' ? 'bg-danger-soft text-danger' : 'bg-navy-50 text-navy'), Icon(a.status === 'Needs review' ? 'triangle-exclamation' : 'file-lines', 'text-lg')),
                  t('span', 'min-w-0 flex-1', t('span', 'block truncate font-bold text-navy', a.name),
                    t('span', cx('block truncate text-sm', n.tone === 'danger' ? 'text-danger' : 'text-slate2'), `${a.ref} · ${n.text}`)),
                  h(KB.Badge, { kind: a.status }), Icon('chevron-right', 'text-navy'));
              }))
              : KB.Card('p-8 text-center text-slate2', 'Everything in the queue is processed.')),
          t('div', null,
            t('h2', 'mb-4 text-xl font-bold text-navy', 'Recent activity'),
            KB.Card('divide-y divide-line px-5', ...s.activity.slice(0, 6).map((a, i) => h('div', { key: i, className: 'py-3.5' }, t('p', 'text-sm text-navy [overflow-wrap:anywhere]', a.text), t('p', 'text-xs text-slate2', a.time)))))),
        t('div', 'rounded-2xl bg-navy-50 p-5 text-sm text-navy', t('span', 'mr-2', Icon('wand-magic-sparkles')), KB.DISCLAIMER)));
  };
})();
