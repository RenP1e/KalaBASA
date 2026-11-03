// Shared chrome: logo, header, hero, footer, buttons, badges, modal, toasts.
(function () {
  const { h, t, cx, Icon } = KB;
  const { useState, useEffect, useRef } = React;

  /* ---- Logo (submitted brand assets in /assets) ---- */
  // big: stacked full logo for splash/login. default: mark + wordmark lockup for the header.
  // Each logo is two stacked images: the navy original (light mode) and a cyan version (dark mode).
  // CSS cross-fades them when the theme changes (see .kb-logo in styles.css).
  const themed = (name, cls, alt, style) => t('span', 'kb-logo shrink-0',
    h('img', { src: `assets/${name}.svg`, alt: alt || '', 'aria-hidden': alt ? undefined : 'true', className: cx('kb-logo-light w-auto select-none', cls), style, draggable: false }),
    h('img', { src: `assets/${name}-dark.svg`, alt: '', 'aria-hidden': 'true', className: cx('kb-logo-dark w-auto select-none', cls), style, draggable: false }));
  KB.Logo = function Logo({ big, office, height }) {
    if (big) return themed('logo', '', 'KalaBASA', { height: (height || 150) + 'px' });
    return t('div', 'flex items-center gap-3',
      themed('logo-mark', 'h-11'),
      themed('logo-wordmark', 'h-6', 'KalaBASA'),
      office && t('span', 'hidden lg:block ml-1 border-l border-line pl-4 text-xs text-slate2', KB.APP.office));
  };
  KB.Tagline = function Tagline({ cls }) {
    return t('p', cx('font-medium tracking-[0.12em] text-navy', cls || 'text-sm'), 'Smarter Review. ', t('span', 'text-brand', 'Faster Service.'));
  };

  /* ---- Buttons / badges ---- */
  const BTN = {
    primary: 'bg-brand text-white hover:bg-brand-dark shadow-sm',
    ghost: 'border border-navy/40 text-navy bg-white/60 hover:bg-navy-50 hover:border-navy',
    outline: 'border border-navy text-navy bg-white hover:bg-navy hover:text-white',
    navy: 'bg-navy text-white hover:bg-navy-600',
    soft: 'bg-danger-soft text-danger border border-danger-line hover:bg-[#FBE0E1]',
    selected: 'bg-navy text-white border border-navy',
  };
  KB.Btn = function Btn({ variant = 'primary', href, onClick, icon, children, full, disabled, type, size }) {
    const cls = cx('inline-flex items-center justify-center gap-2 rounded-full font-semibold transition select-none',
      size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-11 px-5 text-sm', BTN[variant], full && 'w-full',
      disabled && 'opacity-50 pointer-events-none');
    const kids = [icon && Icon(icon, 'text-[13px]'), children];
    return href
      ? h('a', { href: '#' + href, className: cls, key: 'b' }, ...kids)
      : h('button', { type: type || 'button', onClick, disabled, className: cls }, ...kids);
  };

  const BADGE = {
    'In review': 'bg-brand-soft text-brand-dark', Pending: 'bg-brand-soft text-brand-dark', Processed: 'bg-ok-soft text-ok',
    'Needs review': 'bg-danger-soft text-danger', Returned: 'bg-brand-soft text-brand-dark',
    awaiting: 'bg-brand-soft text-brand-dark', confirmed: 'bg-ok-soft text-ok', dismissed: 'bg-navy-50 text-slate2', escalated: 'bg-navy-100 text-navy',
  };
  const BADGE_LABEL = { awaiting: 'Awaiting review', confirmed: 'Confirmed', dismissed: 'Dismissed', escalated: 'Escalated', Returned: 'Returned for correction' };
  KB.Badge = function Badge({ kind, label }) {
    return t('span', cx('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap', BADGE[kind]), label || BADGE_LABEL[kind] || kind);
  };

  /* ---- Toasts ---- */
  const toastSubs = new Set();
  KB.toast = (msg, tone) => toastSubs.forEach((fn) => fn({ id: Date.now() + Math.random(), msg, tone }));
  KB.Toaster = function Toaster() {
    const [items, setItems] = useState([]);
    useEffect(() => {
      const fn = (n) => { setItems((l) => l.concat(n)); setTimeout(() => setItems((l) => l.filter((x) => x.id !== n.id)), 3200); };
      toastSubs.add(fn);
      return () => toastSubs.delete(fn);
    }, []);
    return t('div', 'fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 flex-col gap-2 kb-safe-bottom', ...items.map((n) =>
      h('div', { key: n.id, role: 'status', className: 'kb-toast flex items-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-medium text-white shadow-lift' },
        Icon(n.tone === 'error' ? 'circle-exclamation' : 'circle-check', n.tone === 'error' ? 'text-[#FF9A9D]' : 'text-[#5EDC98]'), n.msg)));
  };

  /* ---- Modal ---- */
  KB.Modal = function Modal({ title, onClose, children, wide }) {
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, []);
    return t('div', 'fixed inset-0 z-[80] grid place-items-center p-4',
      h('div', { className: 'absolute inset-0 bg-navy/50', onClick: onClose }),
      h('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, className: cx('kb-pop relative max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-lift', wide ? 'max-w-2xl' : 'max-w-md') },
        t('div', 'mb-4 flex items-center justify-between gap-4',
          t('h3', 'text-lg font-bold text-navy', title),
          h('button', { onClick: onClose, 'aria-label': 'Close', className: 'grid h-9 w-9 place-items-center rounded-full text-slate2 hover:bg-navy-50' }, Icon('xmark'))),
        children));
  };

  /* ---- Header ---- */
  const NAV = [['home', 'Home', '/home'], ['applications', 'Applications', '/applications'], ['reports', 'Reports', '/reports'], ['profile', 'Profile', '/profile']];

  function Bell() {
    const [open, setOpen] = useState(false);
    const wrap = useRef(null);
    const items = KB.useStore((s) => s.notifications);
    const unread = items.filter((n) => n.unread).length;
    useEffect(() => {
      const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', away);
      return () => document.removeEventListener('mousedown', away);
    }, []);
    const button = h('button', { onClick: () => setOpen(!open), 'aria-label': 'Notifications' + (unread ? ', ' + unread + ' unread' : ''), 'aria-expanded': open,
      className: 'relative grid h-10 w-10 place-items-center rounded-full text-navy hover:bg-navy-50' },
      Icon('bell', 'text-lg', 'regular'),
      unread > 0 && t('span', 'absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-white'));
    const rows = items.map((n) => h('a', { key: n.id, href: n.href, onClick: () => setOpen(false), className: 'flex gap-3 rounded-xl px-3 py-2.5 hover:bg-mist' },
      t('span', cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.unread ? 'bg-danger' : 'bg-transparent')),
      t('span', 'block', t('span', 'block text-sm text-navy', n.text), t('span', 'block text-xs text-slate2', n.time))));
    const panel = open && t('div', 'kb-pop absolute right-0 top-12 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white p-2 shadow-lift',
      t('div', 'flex items-center justify-between px-3 py-2',
        t('span', 'text-sm font-bold text-navy', 'Notifications'),
        h('button', { onClick: () => KB.store.markNotificationsRead(), className: 'text-xs font-semibold text-brand-dark hover:underline' }, 'Mark all as read')),
      ...rows);
    return h('div', { ref: wrap, className: 'relative' }, button, panel);
  }

  KB.Bell = Bell;
  KB.Header = function Header({ active }) {
    return t('header', 'sticky top-0 z-40 border-b border-line bg-white kb-safe-top',
      t('div', 'mx-auto flex h-[74px] max-w-[1160px] items-center justify-between gap-4 px-6',
        h('a', { href: '#/home', 'aria-label': 'KalaBASA home' }, KB.Logo({ office: true })),
        t('div', 'flex items-center gap-1 sm:gap-3',
          h('nav', { className: 'hidden md:flex items-center gap-1', 'aria-label': 'Main' },
            ...NAV.map(([k, label, to]) => h('a', { key: k, href: '#' + to, 'aria-current': active === k ? 'page' : undefined,
              className: cx('rounded-full px-4 py-2 text-sm transition', active === k ? 'bg-navy-50 font-semibold text-navy' : 'text-slate2 hover:text-navy') }, label))),
          h(Bell),
          h('a', { href: '#/profile', className: 'flex items-center gap-3 rounded-full py-1 pl-1 pr-2 hover:bg-mist' },
            t('span', 'grid h-10 w-10 place-items-center rounded-full bg-brand text-sm font-bold text-white', KB.USER.initials),
            t('span', 'hidden sm:block text-sm font-semibold text-navy', KB.USER.name)))),
      // mobile nav
      t('nav', 'kb-scroll-x flex gap-1 border-t border-line px-4 py-2 md:hidden', ...NAV.map(([k, label, to]) =>
        h('a', { key: k, href: '#' + to, className: cx('whitespace-nowrap rounded-full px-4 py-1.5 text-sm', active === k ? 'bg-navy-50 font-semibold text-navy' : 'text-slate2') }, label))));
  };

  /* ---- Hero ---- */
  KB.Hero = function Hero({ crumbs, title, sub, actions, aside }) {
    const parts = [];
    (crumbs || []).forEach((c, i) => {
      if (i) parts.push(h('span', { key: 's' + i, className: 'mx-1 opacity-60' }, '/'));
      parts.push(c.href ? h('a', { key: i, href: '#' + c.href, className: 'hover:underline' }, c.label) : h('span', { key: i }, c.label));
    });
    return t('section', 'kb-hero border-b border-line bg-white/70 text-navy',
      t('div', 'mx-auto flex max-w-[1160px] items-center justify-between gap-8 px-6 pb-12 pt-10',
        t('div', 'min-w-0',
          t('p', 'mb-4 text-xs font-medium text-navy/70', ...parts),
          t('h1', 'text-[40px] font-bold leading-tight tracking-tight text-navy', title),
          sub && t('p', 'mt-3 max-w-2xl text-base text-navy/75', sub),
          actions && t('div', 'mt-7 flex flex-wrap gap-3', ...actions)),
        aside));
  };

  KB.Footer = function Footer() {
    return t('footer', 'border-t border-line bg-white/60',
      t('div', 'mx-auto flex max-w-[1160px] flex-col gap-2 px-6 py-6 text-xs text-slate2 sm:flex-row sm:justify-between',
        t('span', null, `${KB.APP.office} · ${KB.access() === 'consumer' ? 'Applicant portal' : 'Reviewer workspace'}`), t('span', null, KB.DISCLAIMER)));
  };

  // Page shell: header + content + footer.
  KB.Shell = function Shell({ active, children }) {
    return t('div', 'flex min-h-screen flex-col bg-mist',
      h(KB.Header, { active }), t('main', 'flex-1 kb-fade', children), h(KB.Footer));
  };
  KB.Container = (cls, ...c) => t('div', cx('mx-auto max-w-[1160px] px-6', cls), ...c);
  KB.Card = (cls, ...c) => t('div', cx('rounded-2xl border border-line bg-white shadow-card', cls), ...c);
  KB.Empty = function Empty({ title, text, href }) {
    return KB.Container('py-16', KB.Card('p-10 text-center', t('h2', 'text-xl font-bold text-navy', title), t('p', 'mt-2 text-slate2', text), t('div', 'mt-6', h(KB.Btn, { href, variant: 'outline' }, 'Back to applications'))));
  };
})();
