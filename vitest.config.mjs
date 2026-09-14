import { defineConfig } from "vitest/config";

/**
 * Tests de las apps sin build: los menús de `web/` y la `landing/`. El admin
 * tiene su propia configuración en `smaalacarta/admin`.
 *
 * jsdom para todo: la lógica pura no lo necesita, pero un solo entorno evita
 * que cada archivo de test tenga que declarar a qué mitad pertenece.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["smaalacarta/{web,landing}/**/*.test.js"],
  },
});
