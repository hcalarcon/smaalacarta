import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Registrado a mano: la limpieza automática de Testing Library solo se instala
// cuando Vitest corre con globals activados.
afterEach(cleanup);
