// Tailwind Play CDN config. Colours are CSS variables (see css/styles.css) so dark mode only swaps the variables.
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        navy: { DEFAULT: v('navy'), 600: v('navy-600'), 300: v('navy-300'), 100: v('navy-100'), 50: v('navy-50') },
        brand: { DEFAULT: v('brand'), dark: v('brand-dark'), soft: v('brand-soft'), softer: v('brand-softer') },
        ok: { DEFAULT: v('ok'), soft: v('ok-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft'), line: v('danger-line') },
        slate2: v('slate2'), mist: v('mist'), line: v('line'),
      },
      boxShadow: { card: '0 2px 14px rgba(16,47,94,.06)', lift: '0 8px 28px rgba(16,47,94,.12)' },
    },
  },
};
