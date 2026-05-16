import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Stripe-ish neutral base + indigo accent.
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          400: "#818cf8",
          500: "#6366f1",
          600: "#635bff",
          700: "#4f46e5",
          900: "#312e81",
        },
        ink: {
          DEFAULT: "#1a1f36",
          soft: "#3c4257",
          muted: "#697386",
          faint: "#8792a2",
        },
        surface: {
          DEFAULT: "#ffffff",
          subtle: "#f7fafc",
          border: "#e3e8ee",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04)",
        pop: "0 4px 16px rgba(0,0,0,0.08)",
      },
      borderRadius: {
        xl: "0.875rem",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
