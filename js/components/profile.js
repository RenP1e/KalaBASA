(function () {
  const { h, t, cx, Icon } = KB;
  const { useState } = React;
  const Q = KB.Q;

  const row = (label, value) => t('div', 'flex items-center justify-between gap-6 border-b border-line py-4 last:border-0', t('span', 'text-slate2', label), t('span', 'text-right font-bold text-navy', value));

  function SettingRow({ icon, tone, title, sub, right, onClick }) {
    const body = [
      t('span', cx('grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg', tone), Icon(icon)),
      t('span', 'min-w-0 flex-1 text-left', t('span', 'block font-bold text-navy', title), t('span', 'block text-sm text-slate2', sub)),
      right,
    ];
    return onClick
      ? h('button', { onClick, className: 'flex w-full items-center gap-4 border-b border-line py-4 last:border-0 hover:bg-mist/60' }, ...body)
      : h('div', { className: 'flex w-full items-center gap-4 border-b border-line py-4 last:border-0' }, ...body);
  }

  function SecurityModal({ onClose }) {
    const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState('');
    const input = (label, v, set) => h('label', { className: 'block' }, t('span', 'mb-1.5 block text-sm font-semibold text-navy', label),
      h('input', { type: 'password', value: v, onChange: (e) => set(e.target.value), className: 'h-11 w-full rounded-xl border border-line px-4 text-navy focus:border-navy focus:outline-none' }));
    const submit = async (e) => {
      e.preventDefault();
      if (!cur) return setErr('Enter your current password.');
      if (pw.length < 12) return setErr('New password must be at least 12 characters.');
      if (pw !== pw2) return setErr('New passwords do not match.');
      try { await KB.api('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: pw }) }); KB.toast('Password updated. Other sessions were signed out.'); onClose(); }
      catch (error) { setErr(error.message); }
    };
    return h(KB.Modal, { title: 'Security & password', onClose },
      h('form', { onSubmit: submit, className: 'space-y-4' }, input('Current password', cur, setCur), input('New password', pw, setPw), input('Confirm new password', pw2, setPw2),
        err && h('p', { role: 'alert', className: 'text-sm text-danger' }, err),
        t('div', 'flex justify-end gap-3 pt-2', h(KB.Btn, { variant: 'outline', onClick: onClose }, 'Cancel'), h(KB.Btn, { type: 'submit' }, 'Update password'))));
  }

  function HelpModal({ onClose }) {
    const item = (icon, title, text) => t('div', 'flex gap-4 rounded-xl bg-mist p-4', t('span', 'text-navy', Icon(icon)), t('div', null, t('p', 'font-semibold text-navy', title), t('p', 'text-sm text-slate2', text)));
    return h(KB.Modal, { title: 'Help & support', onClose },
      t('div', 'space-y-3',
        item('circle-question', 'How findings work', 'AI suggests findings from the submitted documents. You confirm, dismiss or escalate each one.'),
        item('rotate-left', 'Returning an application', 'Confirmed findings are attached to a correction request sent to the applicant.'),
        item('circle-info', 'Local support', 'Contact the administrator of this LGU installation for account or policy assistance.')));
  }

  function NotificationsModal({ onClose }) {
    const items = KB.useStore((s) => s.notifications);
    return h(KB.Modal, { title: 'Notifications', onClose },
      t('div', 'space-y-2', ...items.map((n) => h('a', { key: n.id, href: n.href, onClick: onClose, className: 'flex gap-3 rounded-xl bg-mist p-4 hover:bg-navy-50' },
        t('span', cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.unread ? 'bg-danger' : 'bg-navy-100')), t('span', null, t('span', 'block text-sm text-navy', n.text), t('span', 'block text-xs text-slate2', n.time))))),
      t('div', 'mt-5 flex justify-end', h(KB.Btn, { variant: 'outline', onClick: () => KB.store.markNotificationsRead() }, 'Mark all as read')));
  }

  KB.pages.Profile = function Profile() {
    const s = KB.useStore();
    const consumer = KB.access() === 'consumer';
    const [modal, setModal] = useState(null);
    const week = Q.report(s, 'week');
    const unread = Q.unread(s);
    const close = () => setModal(null);
    const chevron = Icon('chevron-right', 'text-slate2');

    const stat = (label, value) => t('div', 'flex items-center justify-between py-2.5', t('span', 'text-sm text-white/75', label), t('span', 'text-2xl font-bold', value));

    return h(KB.Shell, { active: 'profile' },
      h(KB.Hero, {
        crumbs: [{ label: consumer ? 'Applicant portal' : 'Reviewer workspace' }, { label: 'Profile' }], title: 'Profile', sub: consumer ? 'Manage your applicant account' : 'Manage your reviewer account',
        actions: [h(KB.Btn, { key: 1, onClick: () => { const el = document.getElementById('personal-info'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 'Personal information'),
          h(KB.Btn, { key: 2, variant: 'ghost', onClick: () => setModal('help') }, 'Help & support')],
      }),
      KB.Container('grid gap-6 py-10 lg:grid-cols-[1fr_1.9fr]',
        t('div', 'space-y-5 self-start',
          t('div', 'rounded-2xl bg-navy p-7 text-white',
            t('div', 'flex items-center gap-5',
              t('div', 'relative', t('span', 'grid h-[76px] w-[76px] place-items-center rounded-full bg-brand text-2xl font-bold ring-4 ring-white', KB.USER.initials), t('span', 'absolute bottom-1 right-1 h-3 w-3 rounded-full bg-ok ring-2 ring-white')),
              t('div', null, t('p', 'text-xl font-bold', KB.USER.name), t('p', 'text-xs text-white/75', `${KB.USER.role} · ${KB.APP.office}`))),
            t('span', 'mt-5 inline-block rounded-full bg-white/15 px-3 py-1 text-xs', `LGU ${KB.USER.lguId}`),
            !consumer && t('div', 'mt-5 border-t border-white/20 pt-3', stat('Reviewed · 7 days', week.reviewed), stat('Findings · 7 days', week.total), stat('Avg. time · 7 days', week.time))),
          t('div', 'rounded-2xl bg-navy-50 p-6', t('div', 'mb-3 text-lg text-navy', Icon('wand-magic-sparkles')), t('p', 'font-bold text-navy', 'Human-led decisions'), t('p', 'mt-2 text-navy', KB.DISCLAIMER)),
          h('button', { onClick: () => { KB.store.logout(); location.hash = '#/login'; }, className: 'flex h-12 w-full items-center justify-center gap-2 rounded-full border border-danger-line bg-[#FFF3F3] font-semibold text-danger hover:bg-danger-soft' }, Icon('arrow-right-from-bracket'), 'Log out'),
          t('p', 'text-center text-xs text-slate2', `KalaBASA v${KB.APP.version}`)),
        t('div', 'space-y-6',
          KB.USER.role === 'admin' && h(KB.AdminRequirements),
          h('section', { id: 'personal-info' }, KB.Card('p-7', t('h2', 'mb-2 text-2xl font-bold text-navy', 'Personal information'),
            row('Full name', KB.USER.name), row('Role & office', `${KB.USER.role} · ${KB.APP.office}`), row('Account', KB.USER.email))),
          KB.Card('p-7', t('h2', 'mb-2 text-2xl font-bold text-navy', 'Account & settings'),
            h(SettingRow, { icon: 'bell', tone: 'bg-brand-soft text-brand', title: 'Notifications', sub: 'Review your account notifications', onClick: () => setModal('notifications'),
              right: t('span', 'flex items-center gap-3', unread > 0 && t('span', 'grid h-6 w-6 place-items-center rounded-full bg-danger text-xs font-bold text-white', unread), chevron) }),
            h(SettingRow, { icon: 'wand-magic-sparkles', tone: 'bg-navy-50 text-navy', title: 'AI-assisted checks', sub: 'AI suggests findings for your review',
              right: h('button', { role: 'switch', 'aria-checked': s.settings.ai, 'aria-label': 'AI-assisted checks', onClick: () => { KB.store.setAI(!s.settings.ai); KB.toast(s.settings.ai ? 'AI-assisted checks turned off' : 'AI-assisted checks turned on'); },
                className: cx('relative h-8 w-14 shrink-0 rounded-full transition', s.settings.ai ? 'bg-brand' : 'bg-navy-100') },
                t('span', cx('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all', s.settings.ai ? 'left-7' : 'left-1'))) }),
            h(SettingRow, { icon: 'lock', tone: 'bg-ok-soft text-ok', title: 'Security & password', sub: 'Manage your account security', onClick: () => setModal('security'), right: chevron }),
            h(SettingRow, { icon: 'circle-question', tone: 'bg-navy-50 text-navy', title: 'Help & support', sub: 'Get help with your reviewer workspace', onClick: () => setModal('help'), right: chevron })))),
      modal === 'security' && h(SecurityModal, { onClose: close }),
      modal === 'help' && h(HelpModal, { onClose: close }),
      modal === 'notifications' && h(NotificationsModal, { onClose: close }));
  };
})();
