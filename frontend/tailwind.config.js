/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Status colors mirror the seeded status_types defaults so the page
      // looks right out of the box. Override per status via inline `style`
      // when admin chooses custom colors.
      colors: {
        status: {
          ontime: "#22c55e",
          late: "#f59e0b",
          early: "#3b82f6",
        },
      },
    },
  },
  plugins: [],
};
