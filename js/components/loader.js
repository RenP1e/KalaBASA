// Full-screen splash (first load and right after sign-in), per the KalaBASA loading design.
(function () {
  const { h, t } = KB;
  KB.Loader = function Loader({ label }) {
    return t('div', 'fixed inset-0 z-[100]', h(KB.Background),
      t('div', 'relative flex h-full flex-col items-center justify-center px-6',
        t('div', 'kb-fade flex flex-col items-center gap-4', KB.Logo({ big: true, height: 190 }), h(KB.Tagline, { cls: 'text-[15px]' }),
          h('span', { role: 'status', 'aria-label': 'Loading', className: 'mt-5 block h-7 w-7 animate-spin rounded-full border-[3px] border-navy-100 border-t-brand' }))),
      t('p', 'absolute bottom-10 left-0 right-0 text-center text-xs text-slate2 kb-safe-bottom', label || 'Initializing KalaBASA...'));
  };
})();
