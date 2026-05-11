/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#0ea5e9',
      }
    },
  },
  plugins: [],
}
