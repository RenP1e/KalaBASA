// Login, per the KalaBASA login design: glass card on the wave background.
(function () {
  const { h, t, cx, Icon } = KB;
  const { useState } = React;

  const GoogleG = () => h('svg', { width: 18, height: 18, viewBox: '0 0 48 48', 'aria-hidden': 'true' },
    h('path', { fill: '#EA4335', d: 'M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z' }),
    h('path', { fill: '#4285F4', d: 'M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z' }),
    h('path', { fill: '#FBBC05', d: 'M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z' }),
    h('path', { fill: '#34A853', d: 'M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z' }));

  KB.pages.Login = function Login() {
    const [email, setEmail] = useState('');
    const [pw, setPw] = useState('');
    const [show, setShow] = useState(false);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
      e.preventDefault();
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr('Enter a valid email address.'); return; }
      if (!pw) { setErr('Enter your password.'); return; }
      setErr(''); setBusy(true);
      try { const acct = await KB.store.login(email.trim(), pw); location.hash = acct.access === 'consumer' ? '#/scan' : '#/home'; }
      catch (error) { setErr(error.message || 'Local service unavailable.'); setBusy(false); }
    };
    const inputCls = 'kb-field h-12 w-full rounded-xl border border-[#D7E0EC] bg-white/80 px-4 text-sm text-navy placeholder:text-slate2 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15';
    const label = (text) => t('span', 'mb-1.5 block text-xs font-bold text-navy', text);
    const social = (key, icon, text) => h('button', { key, type: 'button', onClick: () => KB.toast(`${text} sign-in isn’t connected in this prototype.`),
      className: 'kb-field flex h-12 flex-1 items-center justify-center gap-2.5 rounded-xl border border-[#D7E0EC] bg-white/80 text-sm font-semibold text-navy hover:bg-white' }, icon, text);

    return t('div', 'relative min-h-screen',
      h(KB.Background),
      t('div', 'relative flex min-h-screen flex-col items-center justify-center px-5 py-10 kb-safe-top',
        t('div', 'kb-fade kb-card w-full max-w-[440px] rounded-3xl border border-white bg-white/75 p-8 shadow-[0_20px_50px_rgba(16,47,94,0.12)] backdrop-blur-[9px]',
          t('div', 'flex flex-col items-center gap-2', KB.Logo({ big: true, height: 120 }), h(KB.Tagline, { cls: 'text-[11px]' })),
          t('h1', 'mt-5 text-center text-[26px] font-bold tracking-tight text-navy', 'Welcome back!'),
          t('p', 'mt-1.5 text-center text-sm text-slate2', 'Sign in to your KalaBASA account to continue.'),
          h('form', { onSubmit: submit, noValidate: true, className: 'mt-6 space-y-4' },
            h('label', { className: 'block' }, label('Email Address'), h('input', { type: 'email', value: email, onChange: (e) => setEmail(e.target.value), autoComplete: 'email', placeholder: 'Enter your email address', className: inputCls })),
            h('label', { className: 'block' }, label('Password'), t('div', 'relative',
              h('input', { type: show ? 'text' : 'password', value: pw, onChange: (e) => setPw(e.target.value), autoComplete: 'current-password', placeholder: 'Enter your password', className: cx(inputCls, 'pr-12') }),
              h('button', { type: 'button', onClick: () => setShow(!show), 'aria-label': show ? 'Hide password' : 'Show password', className: 'absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-slate2 hover:bg-navy-50' }, Icon(show ? 'eye-slash' : 'eye', 'text-sm')))),
            t('div', 'flex items-center justify-between',
              t('span', 'text-xs text-slate2', 'Local session · 8 hours'),
              h('button', { type: 'button', onClick: () => KB.toast('Contact your BPLO administrator to reset your password.'), className: 'text-xs font-bold text-navy hover:underline' }, 'Forgot password?')),
            err && h('p', { role: 'alert', className: 'flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger' }, Icon('circle-exclamation'), err),
            h('button', { type: 'submit', disabled: busy, className: 'kb-primary h-12 w-full rounded-xl bg-[#0B2D59] text-[15px] font-semibold text-white transition hover:bg-navy-600 disabled:opacity-60' }, busy ? 'Signing in…' : 'Sign In')),
          t('p', 'mt-5 text-center text-xs text-slate2', 'Don’t have an account? ',
            h('button', { type: 'button', onClick: () => KB.toast('Accounts are created by your BPLO administrator.'), className: 'font-bold text-navy hover:underline' }, 'Sign up')),
          t('div', 'mt-4 rounded-xl bg-navy-50 px-4 py-3 text-xs text-navy', 'Local accounts are created by your LGU administrator. Document processing stays on this machine.',
            h('a', { href: 'http://127.0.0.1:3210', className: 'mt-2 block font-semibold underline' }, 'Open the local KalaBASA service'))),
        t('p', 'mt-6 max-w-[440px] text-center text-[11px] text-slate2', KB.DISCLAIMER)));
  };
})();
