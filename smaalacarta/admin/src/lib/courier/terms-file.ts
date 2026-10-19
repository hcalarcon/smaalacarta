import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseTerms, type Terms } from "./terms";

// El texto vigente de los términos para repartidores (ENVIO-179). Solo servidor: lee el archivo.
export function loadTerms(): Terms {
  return parseTerms(readFileSync(join(process.cwd(), "src", "content", "terminos-repartidores.md"), "utf8"));
}
