/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'md-lg': '900px',
      },
      height: {
        'card': '30rem',
      },
    },
  },
  plugins: [],
}