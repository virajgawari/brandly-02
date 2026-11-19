import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  { ignores: [".next/**", "node_modules/**", ".playwright-mcp/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Existing code uses `any` in places; surface it without blocking until it's cleaned up.
  { rules: { "@typescript-eslint/no-explicit-any": "warn" } },
];
