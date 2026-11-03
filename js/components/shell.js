// Sidebar shell from the KalaBASA designs + light/dark theme control.
(function () {
  const { h, t, cx, Icon } = KB;
  const { useState, useEffect } = React;
  const KEY = 'kalabasa.theme';
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const read = () => { try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; } };
  // Switching theme fades colours over ~0.4s instead of snapping: `kb-theming` turns on CSS transitions
  // for the duration of the switch only (see styles.css), so normal hover/focus behaviour is untouched.
  let themingTimer;
  const apply = (m, animate) => {
    const root = document.documentElement;
    if (animate) {
      root.classList.add('kb-theming');
      clearTimeout(themingTimer);
      themingTimer = setTimeout(() => root.classList.remove('kb-theming'), 600);
    }
    root.classList.toggle('dark', m === 'dark' || (m === 'system' && mq.matches));
  };
  KB.theme = { get: read, set(m) { try { localStorage.setItem(KEY, m); } catch (e) { /* storage may be blocked */ } apply(m, true); } };
  mq.addEventListener('change', () => apply(read(), true));

  function ThemeBtn() {
    const root = document.documentElement;
    const [dark, setDark] = useState(root.classList.contains('dark'));
    useEffect(() => {
      const o = new MutationObserver(() => setDark(root.classList.contains('dark')));
      o.observe(root, { attributes: true, attributeFilter: ['class'] });
      return () => o.disconnect();
    }, []);
    return h('button', { onClick: () => KB.theme.set(dark ? 'light' : 'dark'), 'aria-pressed': dark, 'aria-label': dark ? 'Switch to light mode' : 'Switch to dark mode',
      className: 'grid h-10 w-10 place-items-center rounded-full text-navy hover:bg-navy-50' }, Icon(dark ? 'sun' : 'moon', 'text-lg'));
  }

  const CONSUMER_NAV = [['scan', 'Scan document', '/scan', 'expand'], ['my-reports', 'My reports', '/my-reports', 'file-circle-check']];
  const NAV = [['home', 'Home', '/home', 'table-cells-large'], ['applications', 'Applications', '/applications', 'copy'],
    ['scan', 'Scan document', '/scan', 'expand'], ['reports', 'Reports', '/reports', 'chart-line'], ['profile', 'Profile', '/profile', 'user']];

  function Sidebar({ active, onNav }) {
    const c = KB.Q.counts(KB.useStore((s) => s.apps));
    const nav = KB.access() === 'consumer' ? CONSUMER_NAV : NAV;
    return t('aside', 'flex h-full w-[216px] flex-col bg-[#09284D] px-3.5 pb-4 pt-6 text-white dark:bg-[#071A33]',
      h('a', { href: '#/home', onClick: onNav, className: 'mb-7 block px-2', 'aria-label': 'KalaBASA home' },
        t('div', 'flex items-center gap-2', h('img', { src: 'assets/logo-mark-dark.svg', alt: '', className: 'h-8 w-auto' }),
          t('span', 'text-[22px] leading-none', t('span', 'font-light text-brand', 'Kala'), t('span', 'font-semibold text-white', 'BASA'))),
        t('p', 'mt-2 text-[10px] tracking-[0.18em] text-white/60', 'PERMIT REVIEW SYSTEM')),
      t('p', 'mb-2 px-2 text-[10px] font-semibold tracking-[0.14em] text-white/50', 'WORKSPACE'),
      h('nav', { className: 'space-y-1', 'aria-label': 'Main' }, ...nav.map(([k, label, to, icon]) =>
        h('a', { key: k, href: '#' + to, onClick: onNav, 'aria-current': active === k ? 'page' : undefined,
          className: cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition', active === k ? 'bg-white/10 font-semibold' : 'text-white/75 hover:bg-white/5 hover:text-white') },
          Icon(icon, cx('w-5 text-center', active === k && 'text-brand')), t('span', 'flex-1', label),
          k === 'applications' && t('span', 'text-xs text-white/60', c.pending + c.flagged)))),
      t('div', 'flex-1'),
      t('div', 'mb-4 rounded-2xl bg-white/10 p-4', Icon('circle-question', 'text-lg text-white/70'),
        t('p', 'mt-2 text-sm font-semibold', 'Need a hand?'), t('p', 'mt-1 text-xs leading-relaxed text-white/70', 'Find review guidelines and permit requirements.'),
        t('p', 'mt-3 text-sm font-semibold', 'Help center ', Icon('arrow-up-right-from-square', 'text-xs text-brand'))),
      t('div', 'flex items-center gap-3 border-t border-white/10 px-1 pt-4',
        t('span', 'grid h-9 w-9 place-items-center rounded-full bg-white/15 text-xs font-bold', KB.USER.initials),
        t('span', 'min-w-0 flex-1', t('span', 'block truncate text-sm font-semibold', KB.USER.name), t('span', 'block text-xs text-white/60', KB.USER.role)),
        h('button', { onClick: () => KB.store.logout(), 'aria-label': 'Sign out', className: 'grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10' }, Icon('right-from-bracket'))));
  }

  KB.Shell = function Shell({ active, children }) {
    const [open, setOpen] = useState(false);
    const consumer = KB.access() === 'consumer';
    const label = ((consumer ? CONSUMER_NAV : NAV).find((n) => n[0] === active) || [])[1];
    return t('div', 'min-h-screen bg-mist',
      t('div', 'fixed inset-y-0 left-0 z-40 hidden lg:block', h(Sidebar, { active })),
      open && t('div', 'fixed inset-0 z-[70] lg:hidden', h('div', { className: 'absolute inset-0 bg-black/50', onClick: () => setOpen(false) }),
        t('div', 'kb-pop absolute inset-y-0 left-0', h(Sidebar, { active, onNav: () => setOpen(false) }))),
      t('div', 'flex min-h-screen flex-col lg:pl-[216px]',
        t('header', 'sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-line bg-white px-4 sm:px-8 kb-safe-top',
          h('button', { onClick: () => setOpen(true), 'aria-label': 'Open menu', className: 'grid h-10 w-10 place-items-center rounded-full text-navy hover:bg-navy-50 lg:hidden' }, Icon('bars')),
          t('p', 'text-sm text-slate2', consumer ? 'Applicant portal ' : 'Workspace ', Icon('chevron-right', 'mx-1 text-[10px]'), t('span', 'font-semibold text-navy', label)),
          t('div', 'flex-1'),
          h(KB.ServiceStatus),
          h(ThemeBtn), !consumer && h(KB.Bell),
          t('span', 'ml-1 hidden items-center gap-2 text-sm font-semibold text-navy sm:flex', Icon(consumer ? 'user' : 'shield-halved', 'text-slate2'), consumer ? 'Applicant' : 'Reviewer')),
        t('main', 'flex-1 kb-fade', children), h(KB.Footer)));
  };
})();
