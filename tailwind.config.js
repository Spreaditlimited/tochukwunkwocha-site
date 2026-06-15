module.exports = {
  content: [
    "./*.html",
    "./{blog,build,build-scorecard,contact,courses,dashboard,enrol-ai-for-everyday-business-owners,enrol-prompt-to-production,enrol-prompt-to-profit,enrol-prompt-to-profit-holiday,internal,join-holiday-waitlist,privacy-policy,projects,schools,services,terms-and-conditions}/**/*.html",
    "./assets/**/*.js",
    "./assets/tailwind-inline.css",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        heading: ["Manrope", "sans-serif"],
        mono: ["Fira Code", "monospace"],
        display: ["Playfair Display", "serif"],
      },
      colors: {
        brand: {
          50: "#eef2fb",
          100: "#dfe7f7",
          200: "#ccd3e6",
          300: "#99a9cc",
          400: "#667eb2",
          500: "#22345f",
          600: "#14213d",
          700: "#0f1a33",
          800: "#0f182d",
          900: "#060b14",
        },
      },
    },
  },
  plugins: [],
};
