(function () {
  const h = React.createElement;
  const cx = (...a) => a.flat(Infinity).filter(Boolean).join(' ');
  const t = (tag, cls, ...children) => h(tag, cls ? { className: cls } : null, ...children);
  const Icon = (name, extra, style) => h('i', { className: cx('fa-' + (style || 'solid'), 'fa-' + name, extra), 'aria-hidden': 'true' });
  window.KB = {
    h, t, cx, Icon, Fragment: React.Fragment, pages: {},
    APP: { name: 'KalaBASA', office: 'Local LGU workspace', version: '2.0.0', today: new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric' }) },
    AI: { provider: 'local', endpoint: '/api/assessments', timeoutMs: 1800000 },
    DISCLAIMER: 'AI assists extraction. Configured rules generate findings. Authorized LGU personnel retain all official decisions.',
    STORAGE_KEY: 'kalabasa.v1',
  };
  KB.account = email => { const user = KB.store && KB.store.get().auth; return user && user.email === email ? user : null; };
  Object.defineProperty(KB, 'USER', { get() { return KB.store && KB.store.get().auth || { name: '', email: '', initials: '', role: '' }; } });
  KB.access = () => KB.USER.access || null;
})();
