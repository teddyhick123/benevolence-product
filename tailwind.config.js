/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      // NOTE: This project uses Tailwind v4 (@tailwindcss/postcss).
      // Design tokens are defined in app/globals.css via @theme {}, not here.
      // These entries are kept for editor autocomplete only and have no runtime effect.
      colors: {
        creme: "#fffff9",
        "creme-warm": "#f7f1e3",
        azure: "#5186a6",
        "azure-deep": "#2f5c7a",
        "azure-soft": "#b8d0df",
        coral: "#e07a5f",
        sunset: "#f4a261",
        ink: "#0f172a",
        "ink-60": "rgba(15,23,42,0.6)",
        "ink-30": "rgba(15,23,42,0.3)",
        "ink-10": "rgba(15,23,42,0.1)",
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'Apple Color Emoji', 'Segoe UI Emoji'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
      },
      boxShadow: {
        soft: "0 4px 16px rgba(0,0,0,0.05)",
      }
    },
  },
  plugins: [],
};