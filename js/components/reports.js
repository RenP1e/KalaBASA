// Reviewer workload report: period tabs, KPIs, bar chart, finding outcomes, CSV export.
(function () {
  const { h, t, cx, Icon } = KB;
  const { useState } = React;
  const Q = KB.Q;
  const PERIODS = [['today', 'Today'], ['week', 'This week'], ['month', 'Month']];

  function exportCsv(r, period) {
    const rows = [['Period', period], ['Range', r.range], ['Applications reviewed', r.reviewed], ['Avg. active review time', r.time],
      ['Findings reviewed', r.total], ['Confirmed', r.f.confirmed], ['Dismissed', r.f.dismissed], ['Escalated', r.f.escalated], [],
      ['Bucket', 'Applications reviewed']].concat(r.labels.map((l, i) => [r.subs[i] ? `${l} ${r.subs[i]}` : l, r.bars[i]]));
    const csv = rows.map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `kalabasa-report-${period}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    KB.toast('Report exported');
  }

  function Kpi({ label, value, note, tone }) {
    return KB.Card('p-6', t('p', 'text-sm text-slate2', label), t('p', 'mt-3 text-[40px] font-bold leading-none text-navy', value),
      t('p', cx('mt-4 text-xs font-medium', tone === 'ok' ? 'text-ok' : 'text-navy'), note));
  }

  KB.pages.Reports = function Reports() {
    const s = KB.useStore();
    const [period, setPeriod] = useState('week');
    const r = Q.report(s, period);
    const max = Math.max(1, ...r.bars);
    const last = r.bars.length - 1;
    const seg = [['confirmed', 'Confirmed', 'bg-ok'], ['dismissed', 'Dismissed', 'bg-slate2'], ['escalated', 'Escalated', 'bg-navy']];
    const pct = r.total ? Math.round((r.common.count / r.total) * 100) : 0;

    return h(KB.Shell, { active: 'reports' },
      h(KB.Hero, {
        crumbs: [{ label: 'Reviewer workspace' }, { label: 'Reports' }], title: 'Reports', sub: 'Your reviewer workload',
        actions: [h(KB.Btn, { key: 1, onClick: () => exportCsv(r, period) }, 'Export report'), h(KB.Btn, { key: 2, href: '/applications', variant: 'ghost' }, 'View applications')],
      }),
      KB.Container('space-y-6 py-8',
        t('div', 'flex flex-wrap items-center justify-between gap-4',
          t('div', 'flex gap-3', ...PERIODS.map(([k, label]) => h('button', { key: k, onClick: () => setPeriod(k), 'aria-pressed': period === k,
            className: cx('h-11 rounded-full border px-6 text-sm font-semibold transition', period === k ? 'border-navy bg-navy text-white' : 'border-line bg-white text-navy hover:border-navy') }, label))),
          t('div', 'flex items-center gap-2 text-sm font-medium text-navy', Icon('calendar-days', 'text-slate2'), r.range)),
        t('div', 'grid gap-5 sm:grid-cols-2 lg:grid-cols-4',
          h(Kpi, { label: 'Applications reviewed', value: r.reviewed.toLocaleString('en-US'), note: r.delta, tone: 'ok' }),
          h(Kpi, { label: 'Avg. active review time', value: r.time, note: r.timeNote, tone: 'ok' }),
          h(Kpi, { label: 'Findings reviewed', value: r.total, note: `${r.f.confirmed} confirmed · ${r.f.dismissed} dismissed · ${r.f.escalated} escalated` }),
          h(Kpi, { label: 'Escalated to supervisor', value: r.f.escalated, note: `${r.escPct}% of reviewed findings` })),
        t('div', 'grid gap-6 lg:grid-cols-[2fr_1fr]',
          KB.Card('p-7',
            t('div', 'flex items-center justify-between', t('h2', 'text-2xl font-bold text-navy', 'Applications reviewed'), t('span', 'text-sm text-slate2', r.range)),
            t('p', 'mt-3 flex items-center gap-2 text-xs text-slate2', t('span', 'h-2 w-2 rounded-sm bg-navy-600'), r.chart),
            t('div', 'mt-4 flex h-[250px] items-end gap-3 sm:gap-5', ...r.bars.map((v, i) => h('div', { key: i, className: 'flex h-full flex-1 flex-col justify-end' },
              t('span', cx('mb-2 text-center text-sm font-bold', i === last ? 'text-brand' : 'text-navy'), v),
              h('div', { className: cx('kb-bar w-full rounded-t-xl', i === last ? 'bg-brand' : 'bg-navy-600'), style: { height: Math.max(6, Math.round((v / max) * 190)) + 'px' }, role: 'img', 'aria-label': `${r.labels[i]}: ${v}` })))),
            t('div', 'mt-3 flex gap-3 sm:gap-5', ...r.labels.map((l, i) => h('div', { key: i, className: 'flex-1 text-center' },
              t('p', cx('text-sm font-semibold', i === last ? 'text-brand' : 'text-navy'), l), t('p', 'text-[11px] text-slate2', r.subs[i]))))),
          KB.Card('self-start p-7',
            t('div', 'flex items-center justify-between', t('h2', 'text-2xl font-bold text-navy', 'Finding outcomes'), t('span', 'text-sm text-slate2', `${r.total} reviewed`)),
            t('div', 'mt-5 flex gap-1', ...seg.map(([k, , bg]) => h('div', { key: k, className: cx('h-2.5 rounded-full', bg), style: { flexGrow: r.f[k] || 0.0001, flexBasis: 0 } }))),
            t('div', 'mt-5', ...seg.map(([k, label, bg]) => h('div', { key: k, className: 'flex items-center justify-between border-b border-line py-3.5' },
              t('span', 'flex items-center gap-3 text-slate2', t('span', cx('h-2.5 w-2.5 rounded-full', bg)), label), t('span', 'text-xl font-bold text-navy', r.f[k])))),
            t('p', 'mt-4 text-xs text-slate2', `${r.f.escalated} escalated to supervisor · ${r.escPct}% of reviewed findings`))),
        t('div', 'flex flex-col gap-4 rounded-2xl border border-danger-line bg-danger-soft p-5 sm:flex-row sm:items-center',
          t('div', 'flex flex-1 items-center gap-4',
            t('span', 'grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#FBDADB] text-xl text-danger', Icon('triangle-exclamation')),
            t('div', null, t('p', 'text-xs text-slate2', 'Most common finding'), t('p', 'text-xl font-bold text-navy', r.common.title))),
          t('div', 'sm:w-[300px]', t('p', 'mb-2 text-right text-sm font-bold text-danger', `${r.common.count} of ${r.total}`),
            t('div', 'h-2.5 overflow-hidden rounded-full bg-[#F8D5D6]', h('div', { className: 'h-full rounded-full bg-danger', style: { width: pct + '%' } }))))));
  };
})();
