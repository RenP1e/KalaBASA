(function () {
  const { h, t } = KB;
  const { useState, useEffect } = React;
  KB.ServiceStatus = function ServiceStatus() {
    const [status, setStatus] = useState('Checking local AI');
    useEffect(() => {
      let active = true;
      const check = () => KB.api('/api/health').then(s => { if (active) setStatus(s.model ? `Local AI: ${s.model.name}` : 'Local AI service unavailable'); }).catch(() => { if (active) setStatus('Local service unavailable'); });
      check(); const timer = setInterval(check, 30000);
      return () => { active = false; clearInterval(timer); };
    }, []);
    return h('span', { className: 'hidden text-xs text-slate2 sm:inline', role: 'status' }, status);
  };
  KB.DecisionForm = function DecisionForm({ app }) {
    const [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
    return h('form', { className: 'space-y-3 border-t border-line pt-4', onSubmit: async e => {
      e.preventDefault(); setBusy(true);
      try { await KB.store.approveApplication(app.ref, reason); KB.toast('Your official decision was recorded.'); location.hash = `#/applications/${app.ref}/outcome`; }
      catch (error) { KB.toast(error.message, 'error'); } finally { setBusy(false); }
    } }, h('label', { className: 'block text-sm text-navy' }, 'Official review reason', h('textarea', { value: reason, required: true, minLength: 10, maxLength: 2000, onChange: e => setReason(e.target.value), className: 'mt-2 w-full rounded-lg border border-line bg-white p-3', placeholder: 'Record the evidence supporting your decision.' })),
    h(KB.Btn, { type: 'submit', disabled: busy || reason.trim().length < 10, full: true }, 'Record my approval'));
  };
  KB.AssessmentStatus = function AssessmentStatus({ app }) {
    const [busy, setBusy] = useState(false), [qr, setQr] = useState(null);
    const terminal = ['assessment_completed', 'manual_review_required', 'local_ai_unavailable'].includes(app.processingState);
    const action = async fn => { setBusy(true); try { await fn(); await KB.store.refresh(); } catch (e) { KB.toast(e.message, 'error'); } finally { setBusy(false); } };
    const transmission = { local_only: 'Processed locally · not sent to an LGU', queued: 'Queued for LGU submission · receipt not confirmed', transmitted: 'Successfully transmitted to LGU', received_by_lgu: 'Received by this LGU' }[app.transmissionState];
    return KB.Card('p-5 space-y-3',
      h('p', { className: 'font-bold text-navy', role: 'status' }, KB.processingLabels[app.processingState] || 'Processing locally'),
      t('p', 'text-sm text-slate2', transmission),
      app.remoteReceipt && t('p', 'text-sm font-semibold text-navy', `LGU transmission receipt: ${app.remoteReceipt}`),
      t('p', 'text-xs text-slate2', `Requirements ${app.analysis.requirementsVersion} · ${app.analysis.model}`),
      app.analysis.documents.some(d => d.pageSources?.length) && t('p', 'text-xs text-slate2', (() => { const pages = app.analysis.documents.flatMap(d => d.pageSources || []); return `Text reading: ${pages.filter(p => p.textSource === 'pdf_text').length} pages read directly from PDF · ${pages.filter(p => p.textSource !== 'pdf_text').length} pages processed with OCR`; })()),
      t('p', 'text-xs text-slate2', `Requirements hash: ${app.analysis.requirementsHash}`),
      t('p', 'text-sm text-navy', 'This assessment is advisory. An authorized person must review the evidence and record any official decision.'),
      t('div', 'flex flex-wrap gap-3',
        terminal && app.transmissionState === 'local_only' && h(KB.Btn, { disabled: busy, onClick: () => action(async () => { await KB.api(`/api/assessments/${app.id}/submit`, { method: 'POST' }); KB.toast('Submission queued. Transmission requires an LGU acknowledgement.'); await KB.api('/api/sync/run', { method: 'POST' }); }) }, 'Submit to LGU'),
        terminal && !app.decision && app.transmissionState === 'local_only' && h(KB.Btn, { disabled: busy, variant: 'outline', onClick: () => action(() => KB.api(`/api/assessments/${app.id}/retry`, { method: 'POST' })) }, 'Retry same checklist'),
        terminal && !app.decision && app.transmissionState === 'local_only' && h(KB.Btn, { disabled: busy, variant: 'outline', onClick: () => action(() => KB.api(`/api/assessments/${app.id}/retry`, { method: 'POST', body: JSON.stringify({ useCurrentRequirements: true }) })) }, 'Reassess with current checklist'),
        app.transmissionState === 'queued' && h(KB.Btn, { disabled: busy, onClick: () => action(() => KB.api('/api/sync/run', { method: 'POST' })) }, 'Retry synchronization'),
        h(KB.Btn, { disabled: busy, variant: 'outline', onClick: () => action(async () => { setQr(await KB.api(`/api/assessments/${app.id}/qr`)); }) }, 'Verification QR')),
      qr && t('div', 'space-y-2', h('img', { src: qr.image, alt: 'Local verification QR containing an opaque token', width: 192, height: 192 }), h('a', { href: qr.value, target: '_blank', rel: 'noreferrer', className: 'text-sm font-semibold text-brand-dark' }, 'Open local verification record'), t('p', 'text-xs text-slate2', 'This QR is for this local installation. It contains an opaque token and a relative verification path.')),
      t('div', 'space-y-2', ...app.analysis.documents.map(d => h('a', { key: d.id, href: d.sourceUrl, target: '_blank', rel: 'noreferrer', className: 'block text-sm font-semibold text-brand-dark' }, `Open original: ${d.file}`))));
  };
  KB.AdminRequirements = function AdminRequirements() {
    const [text, setText] = useState(''), [open, setOpen] = useState(false), [history, setHistory] = useState([]);
    const [user, setUser] = useState({ email: '', name: '', password: '', role: 'applicant' });
    const load = async () => {
      try {
        const policy = await KB.api('/api/requirements');
        if (policy) { const { hash, savedAt, savedBy, ...editable } = policy; setText(JSON.stringify(editable, null, 2)); }
        setHistory(await KB.api('/api/admin/requirements/history')); setOpen(true);
      } catch (e) { KB.toast(e.message, 'error'); }
    };
    return KB.Card('p-6 space-y-4', t('h2', 'text-xl font-bold text-navy', 'LGU administration'),
      h(KB.Btn, { variant: 'outline', onClick: load }, 'Configure requirements and accounts'),
      open && t('div', 'space-y-4',
        t('p', 'text-sm text-slate2', 'Edit the checklist, fields and enabled rules. Publish with a new version. Existing assessments retain their original policy.'),
        h('textarea', { 'aria-label': 'LGU requirements JSON', rows: 22, value: text, onChange: e => setText(e.target.value), className: 'w-full rounded-xl border border-line bg-white p-4 font-mono text-xs text-navy' }),
        h(KB.Btn, { onClick: async () => { try { await KB.api('/api/admin/requirements', { method: 'POST', body: text }); KB.toast('New requirements version published.'); await load(); } catch (e) { KB.toast(e.message, 'error'); } } }, 'Publish new requirements version'),
        t('p', 'text-xs text-slate2', `Published versions: ${history.map(p => p.version).join(', ')}`),
        h(KB.Btn, { variant: 'outline', onClick: async () => { try { const audit = await KB.api('/api/admin/audit'); const url = URL.createObjectURL(new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'kalabasa-audit.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { KB.toast(e.message, 'error'); } } }, 'Export audit log'),
        h('form', { className: 'space-y-3 border-t border-line pt-4', onSubmit: async e => { e.preventDefault(); try { await KB.api('/api/admin/users', { method: 'POST', body: JSON.stringify({ ...user, lguId: KB.USER.lguId }) }); setUser({ email: '', name: '', password: '', role: 'applicant' }); KB.toast('Local account created.'); } catch (e) { KB.toast(e.message, 'error'); } } },
          t('h3', 'font-bold text-navy', 'Create local account'),
          ...['email', 'name', 'password'].map(key => h('input', { key, 'aria-label': `New account ${key}`, type: key === 'password' ? 'password' : key === 'email' ? 'email' : 'text', required: true, minLength: key === 'password' ? 12 : 1, value: user[key], placeholder: key === 'password' ? 'Password (12+ characters)' : key, onChange: e => setUser({ ...user, [key]: e.target.value }), className: 'block w-full rounded-lg border border-line bg-white p-3 text-navy' })),
          h('select', { 'aria-label': 'New account role', value: user.role, onChange: e => setUser({ ...user, role: e.target.value }), className: 'rounded-lg border border-line bg-white p-3 text-navy' }, ...['applicant', 'reviewer', 'admin'].map(role => h('option', { key: role, value: role }, role))),
          h(KB.Btn, { type: 'submit' }, 'Create account'))));
  };
})();
