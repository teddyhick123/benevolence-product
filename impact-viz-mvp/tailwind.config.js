/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        creme: "#fffff9",
        azure: "#5186a6",
        ink: "#0f172a"
      },
      fontFamily: {
        playfair: ['var(--font-playfair)', 'serif'],
      },
      boxShadow: {
        soft: "0 4px 16px rgba(0,0,0,0.05)",
      }
    },
  },
  plugins: [],
};