// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        telha: { DEFAULT: "#0f0c08", light: "#2b241b" },
        verde: { DEFAULT: "#7d6947", claro: "#bca679" },
        preto: "#0f0c08",
        parchment: { DEFAULT: "#ead9ae", dark: "#dcc392" },
        cream: "#f7edcf",
        "brown-light": "#ab9368",
        "brown-mid": "#725d3d",
      },
      fontFamily: {
        heading: ["Bitter", "Georgia", "serif"],
        body: ["Lora", "Georgia", "serif"],
        mono: ["JetBrains Mono", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
