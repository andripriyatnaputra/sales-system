/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@shadcn/ui/dist/**/*.js",
  ],
  theme: {
    extend: {
      maxWidth: {
      '7.5xl': '83rem', // di antara 7xl (80rem) dan 8xl (96rem)
    }
    },
  },
  plugins: [require("tailwindcss-animate")], // optional if you want animations
};
