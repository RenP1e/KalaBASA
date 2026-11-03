// Hash router + app bootstrap.
(function () {
  const { h } = KB;
  const { useState, useEffect } = React;
  const P = KB.pages;

  const useHash = () => {
    const [hash, setHash] = useState(location.hash);
    useEffect(() => {
      const on = () => setHash(location.hash);
      window.addEventListener('hashchange', on);
      return () => window.removeEventListener('hashchange', on);
    }, []);
    return hash;
  };

  const parts = (hash) => (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

  // Consumers can reach exactly these pages (scan/upload + their own findings reports). Nothing else.
  const CONSUMER_PAGES = ['scan', 'my-reports'];
  const allowed = (hash, access) => (access === 'consumer' ? CONSUMER_PAGES.includes(parts(hash)[0]) : parts(hash)[0] !== 'my-reports');
  const homeFor = (access) => (access === 'consumer' ? '#/scan' : '#/home');

  // '#/applications/BP-2026-1043/finding/2' -> view element
  function route(hash) {
    const p = parts(hash);
    switch (p[0]) {
      case 'applications':
        if (!p[1]) return { el: h(P.Applications), key: 'apps' };
        if (p[2] === 'finding') return { el: h(P.Review, { appRef: p[1], n: p[3] || '1' }), key: p.join('/') };
        if (p[2] === 'check') return { el: h(P.Check, { appRef: p[1] }), key: p.join('/') };
        if (p[2] === 'fields') return { el: h(P.Fields, { appRef: p[1] }), key: p.join('/') };
        if (p[2] === 'outcome') return { el: h(P.Outcome, { appRef: p[1] }), key: p.join('/') };
        return { el: h(P.ApplicationDetail, { appRef: p[1] }), key: p.join('/') };
      case 'scan': return { el: h(P.Scan, { resubRef: p[1] }), key: p.join('/') };
      case 'my-reports':
        return p[1] ? { el: h(P.MyReport, { appRef: p[1] }), key: p.join('/') } : { el: h(P.MyReports), key: 'my-reports' };
      case 'reports': return { el: h(P.Reports), key: 'reports' };
      case 'profile': return { el: h(P.Profile), key: 'profile' };
      default: return { el: h(P.Home), key: 'home' };
    }
  }

  function App() {
    const auth = KB.useStore((s) => s.auth);
    const ready = KB.useStore((s) => s.ready);
    const hash = useHash();
    const [loading, setLoading] = useState(true);
    const signedIn = !!auth;
    const acct = auth && KB.account(auth.email);
    const access = acct ? acct.access : null;

    // Splash on first load and again right after sign-in.
    useEffect(() => {
      setLoading(true);
      const id = setTimeout(() => setLoading(false), signedIn ? 700 : 900);
      return () => clearTimeout(id);
    }, [signedIn]);

    // Keep the URL in step with auth state and role; start each page at the top.
    useEffect(() => {
      if (!ready) return;
      if (!signedIn && hash !== '#/login') location.replace('#/login');
      if (signedIn && (hash === '#/login' || !hash || !allowed(hash, access))) location.replace(homeFor(access));
    }, [signedIn, hash, access, ready]);
    useEffect(() => { window.scrollTo(0, 0); }, [hash]);

    if (loading || !ready) return h(KB.Loader);
    if (!signedIn) return h('div', null, h(P.Login), h(KB.Toaster));
    if (!allowed(hash, access)) return h(KB.Loader); // redirect to this role's home is in flight
    const r = route(hash);
    return h('div', null, h(React.Fragment, { key: r.key }, r.el), h(KB.Toaster));
  }

  KB.store.init();
  ReactDOM.createRoot(document.getElementById('root')).render(h(App));
})();
