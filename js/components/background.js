// Wave background from the KalaBASA login/loading designs (inline SVG, no external images).
(function () {
  const { h, t } = KB;
  const S = (props, ...c) => h('svg', Object.assign({ 'aria-hidden': 'true', xmlns: 'http://www.w3.org/2000/svg' }, props), ...c);
  const P = (d, fill, extra) => h('path', Object.assign({ d, fill }, extra));
  const stops = (a) => a.map(([o, c]) => h('stop', { key: o, offset: o, stopColor: c }));

  const WAVE = "M0 933.111C387.562 789.556 459.333 215.333 1119.62 0H1665.08C904.312 200.978 846.896 1047.96 0 1234.58V933.111ZM1220.1 1292C1550.25 947.467 1708.15 818.267 2067 703.422V897.222C1693.79 1022.12 1550.25 1162.8 1449.77 1292H1220.1Z";
  const GLOW = "M307.302 0H440C338.032 147 129.905 153 0 250V201C152.254 126 237.46 95 307.302 0Z";

  KB.Background = function Background() {
    return t('div', 'kb-bg pointer-events-none fixed inset-0 -z-0 overflow-hidden bg-[#FBFCFF]',
      // soft page gradient + large white sweeps
      S({ className: 'absolute inset-0 h-full w-full', viewBox: '0 0 2067 1292', preserveAspectRatio: 'xMidYMid slice' },
        h('defs', null, h('linearGradient', { id: 'kb-bg0', x1: 0, y1: 0, x2: 2067, y2: 0, gradientUnits: 'userSpaceOnUse' }, stops([[0, '#ECF1F9'], [0.37, '#FBFCFF'], [0.7, '#FBFCFF'], [1, '#ECF1F9']]))),
        h('rect', { width: 2067, height: 1292, fill: 'url(#kb-bg0)' }),
        P(WAVE, 'white', { opacity: 0.56 })),
      // top-left corner ribbons
      S({ className: 'absolute left-0 top-0 h-auto w-[24vw] min-w-[170px] max-w-[500px]', viewBox: '0 0 500 250', preserveAspectRatio: 'xMinYMin meet' },
        h('defs', null, h('linearGradient', { id: 'kb-bg1', x1: 0, y1: 250, x2: 440, y2: 250, gradientUnits: 'userSpaceOnUse' }, stops([[0, '#061B39'], [1, '#0B2D59']]))),
        P('M0 0H500C404 100 253 53 151 141C92 190 47 216 0 244V0Z', '#FF851B'),
        P('M0 0H440C386 163 189 107 98 167C50 198 15 229 0 250V0Z', 'url(#kb-bg1)'),
        P(GLOW, '#6389BE', { opacity: 0.2 })),
      // bottom swoosh
      S({ className: 'absolute bottom-0 left-0 h-[6vw] min-h-[34px] w-full', viewBox: '0 1168 2067 124', preserveAspectRatio: 'none' },
        h('defs', null, h('linearGradient', { id: 'kb-bg2', x1: 0, y1: 1180, x2: 2067, y2: 1180, gradientUnits: 'userSpaceOnUse' }, stops([[0, '#0B2D59'], [1, '#061B39']]))),
        P('M1347 1292C1603 1227 1863 1286 2067 1168V1292H1347Z', '#FF851B'),
        P('M0 1292C601.44 1231 1555.99 1360 2067 1180V1292H0Z', 'url(#kb-bg2)')));
  };
})();
