/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172437",
        muted: "#65748a",
        blue: "#315efb",
        canvas: "#f6f7fb",
        line: "#e7ebf2",
      },
      boxShadow: {
        card: "0 10px 34px rgba(28, 48, 82, .055)",
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
