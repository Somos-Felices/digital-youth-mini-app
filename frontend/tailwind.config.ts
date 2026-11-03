import type { Config } from "tailwindcss";
const config: Config = { content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"], theme: { extend: { colors: { ground: "var(--dp-color-ground)", ink: "var(--dp-color-ink)" } } }, plugins: [] };
export default config;
