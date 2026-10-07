/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    fontFamily: { sans: ['var(--appearance-font-family, "Inter Variable", sans-serif)'] },
    fontWeight: Object.fromEntries(
      Object.entries({
        thin: 100,
        extralight: 200,
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
        black: 900,
      }).map(([name, weight]) => [name, `max(var(--appearance-font-weight-min, 400), ${weight})`])
    ),
    extend: { colors: { ink: "#172033", cyan: { DEFAULT: "#16c1d4" }, lime: "#a3e635" } },
  },
  plugins: [],
};
