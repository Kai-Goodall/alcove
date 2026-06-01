import next from "eslint-config-next/core-web-vitals";

// Flat ESLint config (Next.js 16 + ESLint 10). `next lint` is removed in
// Next 16, so we run ESLint directly via `npm run lint`.
export default [
  ...next,
  {
    ignores: [
      ".next/**",
      "dist/**",
      "node_modules/**",
      "convex/_generated/**",
      ".squircle-probe/**",
    ],
  },
];
