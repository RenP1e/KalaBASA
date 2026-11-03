// Server-authoritative state. Personal data and session credentials are never stored in localStorage.
(function () {
  let state = { auth: null, ready: false, settings: { ai: true }, apps: [], notifications: [], activity: [] };
  let csrf = '', refreshing = null;
  const subscribers = new Set();
  const set = patch => { state = Object.assign({}, state, patch); subscribers.forEach(fn => fn()); };
  KB.api = async (url, options = {}) => {
    const headers = Object.assign({}, options.headers);
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;
    let response;
    try { response = await fetch(url, Object.assign({}, options, { headers, credentials: 'same-origin', cache: 'no-store' })); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('Cannot reach the local KalaBASA service. Start it with npm start, then open http://127.0.0.1:3210.');
    }
    if (response.status === 401 && !url.endsWith('/login')) { csrf = ''; set({ auth: null, apps: [] }); }
    const text = await response.text();
    if (!text.trim() || !(response.headers.get('content-type') || '').includes('application/json')) {
      throw new Error('This page is not connected to the KalaBASA backend. Open http://127.0.0.1:3210 and sign in there. A static preview or VS Code Live Server cannot process sign-ins.');
    }
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('The local service returned an incomplete response. Refresh http://127.0.0.1:3210 and try again.'); }
    if (!response.ok) {
      throw new Error(data.error || 'Local service request failed.');
    }
    return data;
  };
  async function refresh() {
    if (refreshing) return refreshing;
    const ownerId = state.auth && state.auth.id;
    refreshing = (async () => {
      const apps = await KB.api('/api/assessments');
      if (!state.auth || state.auth.id !== ownerId) return;
      set({ apps, activity: apps.slice(0, 6).map(a => ({ text: `${a.ref}: ${a.note}`, time: KB.Q.ago(a.agoMin) })) });
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  const current = ref => state.apps.find(a => a.ref === ref);
  const updateApplication = app => set({ apps: [app].concat(state.apps.filter(a => a.id !== app.id)) });
  async function decision(ref, type, reason) {
    const a = current(ref);
    const result = await KB.api(`/api/assessments/${a.id}/decisions`, { method: 'POST', body: JSON.stringify({ type, reason, revision: a.revision }) });
    updateApplication(result);
  }
  KB.store = {
    get: () => state,
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    async init() {
      try {
        const data = await KB.api('/api/auth/me'); csrf = data.csrf; set({ auth: data.user });
        KB.APP.office = data.user.lguId; await refresh();
      } catch { /* Login remains available without a session. */ }
      finally { set({ ready: true }); }
    },
    async login(email, password) {
      const data = await KB.api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      csrf = data.csrf; KB.APP.office = data.user.lguId; set({ auth: data.user, apps: [] });
      await refresh(); return data.user;
    },
    async logout() {
      try { await KB.api('/api/auth/logout', { method: 'POST' }); csrf = ''; set({ auth: null, apps: [], notifications: [], activity: [] }); location.hash = '#/login'; }
      catch (e) { KB.toast(e.message, 'error'); }
    },
    refresh,
    addScanned(names, result) { updateApplication(result.application); return result.application.ref; },
    setAI(ai) { set({ settings: { ai: !!ai } }); },
    markNotificationsRead() { set({ notifications: state.notifications.map(n => Object.assign({}, n, { unread: false })) }); },
    async reviewFinding(ref, index, status) {
      const a = current(ref), f = a.findings[index];
      updateApplication(await KB.api(`/api/assessments/${a.id}/findings/${encodeURIComponent(f.key)}`, { method: 'POST', body: JSON.stringify({ status, revision: a.revision }) }));
    },
    returnApplication: ref => decision(ref, 'returned'),
    forwardApplication: ref => decision(ref, 'forwarded'),
    approveApplication: (ref, reason) => decision(ref, 'approved', reason),
  };
  KB.Q = {
    group: a => a.decision ? 'processed' : a.findings.length ? 'flagged' : 'pending',
    visible: apps => apps,
    counts(apps) { const out = { total: apps.length, pending: 0, processed: 0, flagged: 0 }; apps.forEach(a => out[KB.Q.group(a)]++); return out; },
    find: (apps, ref) => apps.find(a => a.ref === ref),
    completed: apps => apps.filter(a => a.transmissionState === 'received_by_lgu'),
    open: a => a.findings.filter(f => f.status === 'awaiting'),
    firstOpenIdx: a => a.findings.findIndex(f => f.status === 'awaiting'),
    note: a => ({ text: a.note, tone: a.findings.length ? 'danger' : 'normal' }),
    ago: min => min < 1 ? 'just now' : min < 60 ? `${Math.round(min)}m ago` : min < 1440 ? `${Math.floor(min / 60)}h ago` : `${Math.floor(min / 1440)}d ago`,
    nextApp: apps => apps.find(a => !a.decision),
    nextRoute(apps) { const a = KB.Q.nextApp(apps); if (!a) return null; const i = KB.Q.firstOpenIdx(a); return i < 0 ? `/applications/${a.ref}` : `/applications/${a.ref}/finding/${i + 1}`; },
    unread: s => s.notifications.filter(n => n.unread).length,
    report(s, period) {
      const days = period === 'today' ? 1 : period === 'week' ? 7 : 30, cutoff = Date.now() - days * 86400000;
      const apps = s.apps, f = { confirmed: 0, dismissed: 0, escalated: 0 };
      const reviewed = apps.filter(a => a.decision && Date.parse(a.decision.at) >= cutoff).length;
      apps.forEach(a => a.findings.forEach(x => { if (x.reviewedAt && Date.parse(x.reviewedAt) >= cutoff && Object.hasOwn(f, x.status)) f[x.status]++; }));
      const total = f.confirmed + f.dismissed + f.escalated;
      return { range: `Past ${days} day${days === 1 ? '' : 's'}`, reviewed, delta: 'Recorded human decisions', time: 'Unavailable', timeNote: 'Active review duration is not measured',
        f, total, escPct: total ? Math.round(f.escalated / total * 100) : 0, common: { title: 'See individual assessment findings', count: 0 }, chart: 'Recorded decisions', bars: [reviewed], labels: ['Decisions'], subs: [''] };
    },
  };
  KB.useStore = selector => { const s = React.useSyncExternalStore(KB.store.subscribe, KB.store.get, KB.store.get); return selector ? selector(s) : s; };
  setInterval(() => { if (state.auth && !document.hidden) refresh().catch(() => {}); }, 15000);
})();
