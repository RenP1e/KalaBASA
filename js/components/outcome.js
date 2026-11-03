// Decision receipt shown after an application is approved or returned.
(function () {
  const { h, t, cx, Icon } = KB;
  const Q = KB.Q;
  const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];
  const word = (n) => (n < WORDS.length ? WORDS[n] : String(n));

  const row = (label, value, cls) => t('div', 'flex items-center justify-between gap-6 border-b border-line py-4 last:border-0', t('span', 'text-slate2', label), t('span', cx('text-right font-bold', cls || 'text-navy'), value));

  function Seal({ approved }) {
    const [outer, inner] = approved ? ['bg-ok-soft', 'bg-ok'] : ['bg-brand-soft', 'bg-brand'];
    return t('div', cx('hidden h-[164px] w-[164px] shrink-0 place-items-center rounded-full md:grid', outer),
      t('div', 'grid h-[132px] w-[132px] place-items-center rounded-full bg-white',
        t('div', cx('grid h-[100px] w-[100px] place-items-center rounded-full text-white', inner), Icon(approved ? 'check' : 'rotate-left', 'text-5xl'))));
  }

  KB.pages.Outcome = function Outcome({ appRef }) {
    const apps = KB.useStore((s) => s.apps);
    const a = Q.find(apps, appRef);
    if (!a) return h(KB.Shell, { active: 'applications' }, h(KB.Empty, { title: 'Application not found', text: `We couldn’t find ${appRef}.`, href: '/applications' }));
    const d = a.decision;
    if (!d) return h(KB.Shell, { active: 'applications' }, h(KB.Empty, { title: 'No decision recorded yet', text: `${a.name} has not been decided. Open the application to continue its review.`, href: '/applications/' + a.ref }));

    const approved = d.type === 'approved';
    const by = d.by.split(' · ')[0];
    const nF = a.findings.length;
    const nC = a.findings.filter((f) => f.status === 'confirmed').length;
    const next = Q.nextRoute(apps);
    const nextBtn = next ? h(KB.Btn, { key: 1, href: next }, 'Review next application') : h(KB.Btn, { key: 1, onClick: () => KB.toast('Queue is clear. Nice work!') }, 'Review next application');

    return h(KB.Shell, { active: 'applications' },
      h(KB.Hero, {
        crumbs: [{ label: 'Applications', href: '/applications' }, { label: a.ref, href: '/applications/' + a.ref }, { label: 'Decision recorded' }],
        title: approved ? 'Application Approved' : 'Returned for Correction',
        sub: approved ? 'The authorized LGU officer approved this application. The decision is recorded.'
          : `${by} returned the application. ${word(nC)} correction request${nC === 1 ? ' was' : 's were'} sent to the applicant.`,
        actions: [nextBtn, h(KB.Btn, { key: 2, href: '/applications', variant: 'ghost' }, 'Back to applications')],
        aside: h(Seal, { approved }),
      }),
      KB.Container('grid gap-6 py-10 lg:grid-cols-[1.35fr_1fr]',
        KB.Card('p-7',
          t('div', 'mb-3 flex items-center justify-between', t('h2', 'text-2xl font-bold text-navy', 'Decision receipt'), t('span', 'text-sm text-slate2', d.date)),
          row('Reference no.', a.ref), row('Business', a.name),
          ...(approved ? [row('Permit type', a.type), row('Approved by', d.by), row('Findings', nF ? `${nF} resolved by reviewer` : 'None raised', 'text-ok'), row('Recorded', `${d.date} · ${d.time}`)]
            : [row('Findings attached', `${nC} confirmed finding${nC === 1 ? '' : 's'}`), row('Returned by', d.by), row('Recorded', `${d.date} · ${d.time}`)])),
        t('div', 'space-y-6 self-start',
          KB.Card('p-6',
            t('h2', 'mb-4 flex items-center gap-3 text-xl font-bold text-navy', Icon(approved ? 'circle-check' : 'rotate-left', approved ? 'text-ok' : 'text-brand'), 'Application status'),
            h(KB.Badge, { kind: approved ? 'Processed' : 'Returned', label: approved ? 'Approved' : 'Returned for correction' }),
            t('p', 'mt-4 text-slate2', approved ? `${a.name}’s ${a.type.toLowerCase()} has been approved by ${by}, the authorized LGU officer.` : `${a.name}’s application was returned by ${d.by}.`)),
          t('div', cx('rounded-2xl p-6', approved ? 'bg-ok-soft' : 'bg-brand-soft'),
            t('h3', 'text-lg font-bold text-navy', approved ? 'Review complete' : 'Correction requests sent'),
            t('p', 'mt-2 text-navy', approved ? `${nF} finding${nF === 1 ? '' : 's'} resolved by reviewer. This application’s decision is recorded.`
              : `${word(nC)} correction request${nC === 1 ? ' was' : 's were'} sent to the applicant, with ${nC} confirmed finding${nC === 1 ? '' : 's'} attached.`)))));
  };
})();
