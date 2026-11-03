module.exports = {
  "darkMode": "class",
  "theme": {
    "extend": {
      "fontFamily": {
        "sans": [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ]
      },
      "colors": {
        "navy": {
          "50": "rgb(var(--navy-50) / <alpha-value>)",
          "100": "rgb(var(--navy-100) / <alpha-value>)",
          "300": "rgb(var(--navy-300) / <alpha-value>)",
          "600": "rgb(var(--navy-600) / <alpha-value>)",
          "DEFAULT": "rgb(var(--navy) / <alpha-value>)"
        },
        "brand": {
          "DEFAULT": "rgb(var(--brand) / <alpha-value>)",
          "dark": "rgb(var(--brand-dark) / <alpha-value>)",
          "soft": "rgb(var(--brand-soft) / <alpha-value>)",
          "softer": "rgb(var(--brand-softer) / <alpha-value>)"
        },
        "ok": {
          "DEFAULT": "rgb(var(--ok) / <alpha-value>)",
          "soft": "rgb(var(--ok-soft) / <alpha-value>)"
        },
        "danger": {
          "DEFAULT": "rgb(var(--danger) / <alpha-value>)",
          "soft": "rgb(var(--danger-soft) / <alpha-value>)",
          "line": "rgb(var(--danger-line) / <alpha-value>)"
        },
        "slate2": "rgb(var(--slate2) / <alpha-value>)",
        "mist": "rgb(var(--mist) / <alpha-value>)",
        "line": "rgb(var(--line) / <alpha-value>)"
      },
      "boxShadow": {
        "card": "0 2px 14px rgba(16,47,94,.06)",
        "lift": "0 8px 28px rgba(16,47,94,.12)"
      }
    }
  },
  "content": [
    "./index.html",
    "./js/**/*.js"
  ]
};
