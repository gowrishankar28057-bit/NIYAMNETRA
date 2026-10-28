/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        navy: {
          50: "#eef3fb", 100: "#d9e4f5", 200: "#b3c9ea", 300: "#7f9fd6",
          400: "#4e74bd", 500: "#2e549e", 600: "#1f3f80", 700: "#1a3269",
          800: "#152851", 900: "#0b1b3b", 950: "#07122a",
        },
        brand: {
          50: "#eff5ff", 100: "#dbe7fe", 200: "#bfd4fe", 300: "#93b4fd",
          400: "#608afa", 500: "#3b64f5", 600: "#2546e8", 700: "#1d35d4",
          800: "#1e2fac", 900: "#1e2d88", 950: "#171e52",
        },
        teal: {
          50: "#eefdf6", 100: "#d5fbe9", 200: "#aef4d6", 300: "#75e8bb",
          400: "#36d29a", 500: "#12b783", 600: "#07946b", 700: "#067658",
          800: "#085d47", 900: "#074c3b", 950: "#022b22",
        },
      },
      boxShadow: {
        glass: "0 10px 40px -12px rgba(11, 27, 59, 0.35)",
        card: "0 4px 24px -8px rgba(11, 27, 59, 0.18)",
        pop: "0 20px 60px -15px rgba(11, 27, 59, 0.45)",
      },
      backdropBlur: { xs: "2px" },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: { "fade-up": "fade-up 0.4s ease-out" },
    },
  },
  plugins: [],
};
