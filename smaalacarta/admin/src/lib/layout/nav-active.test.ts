import { describe, expect, it } from "vitest";

import { superAdminLinks } from "@/components/layout/nav-links";

import { activeHref } from "./nav-active";

const active = (pathname: string) => activeHref(pathname, superAdminLinks);

describe("superAdminLinks (ENVIO-93)", () => {
  it("incluye Repartidores y Zonas, entre Nuevo negocio e Imágenes", () => {
    const hrefs = superAdminLinks.map((link) => link.href);

    expect(hrefs).toContain("/superadmin/repartidores");
    expect(hrefs).toContain("/superadmin/zonas");
    expect(hrefs.indexOf("/superadmin/repartidores")).toBe(
      hrefs.indexOf("/superadmin/negocios/nuevo") + 1,
    );
    expect(hrefs.indexOf("/superadmin/zonas")).toBe(
      hrefs.indexOf("/superadmin/repartidores") + 1,
    );
    expect(hrefs.indexOf("/superadmin/imagenes")).toBe(
      hrefs.indexOf("/superadmin/zonas") + 1,
    );
  });
});

describe("activeHref (ENVIO-94)", () => {
  it("marca Negocios solo en /superadmin y en el detalle de un negocio", () => {
    expect(active("/superadmin")).toBe("/superadmin");
    expect(active("/superadmin/negocios/abc")).toBe("/superadmin");
  });

  it("marca Nuevo negocio, Repartidores y Zonas en sus rutas y subrutas", () => {
    expect(active("/superadmin/negocios/nuevo")).toBe("/superadmin/negocios/nuevo");
    expect(active("/superadmin/repartidores")).toBe("/superadmin/repartidores");
    expect(active("/superadmin/repartidores/nuevo")).toBe("/superadmin/repartidores");
    expect(active("/superadmin/repartidores/abc")).toBe("/superadmin/repartidores");
    expect(active("/superadmin/zonas")).toBe("/superadmin/zonas");
    expect(active("/superadmin/imagenes")).toBe("/superadmin/imagenes");
  });

  it("no marca nada en una ruta que no es del menú", () => {
    expect(active("/otra")).toBeNull();
  });
});
