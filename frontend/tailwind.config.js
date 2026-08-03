/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#0F766E",
          dark: "#115E59",
          light: "#CCFBF1",
        },
        status: {
          active: "#16A34A",
          closed: "#6B7280",
          withdrawn: "#DC2626",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
