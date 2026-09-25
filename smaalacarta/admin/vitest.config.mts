import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Un solo entorno para toda la suite. Los tests de `src/lib` no necesitan DOM,
 * pero jsdom cuesta poco y así un archivo nuevo nunca tiene que declarar a qué
 * mitad de la app pertenece.
 *
 * `resolve.tsconfigPaths` hace que los imports `@/` resuelvan igual que en
 * `next build`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["{app,src}/**/*.test.{ts,tsx}"],
  },
});
