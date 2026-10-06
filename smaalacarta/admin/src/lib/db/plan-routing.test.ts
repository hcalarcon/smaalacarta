// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import { menuLinks, type BusinessPlan } from "@/lib/menu-url";
import { asUser, createTestDb, createUser, type TestDb } from "@/test/db";

// RUTAS-5, PDF-5, ESTATICO-5 y ADMIN-CONFIG-10 contra Postgres real: los tres servicios son
// independientes. Las ocho combinaciones de planes × interactivo / estático / PDF × subdominio / path.
const SUPER = "5a5a5a5a-0000-0000-0000-000000000009";

let db: TestDb;

const COMBOS: BusinessPlan[] = [];
for (const planPdf of [false, true])
  for (const planWeb of [false, true])
    for (const planCompleto of [false, true]) COMBOS.push({ planPdf, planWeb, planCompleto });

const slugOf = (plan: BusinessPlan) =>
  `n-${Number(plan.planPdf)}${Number(plan.planWeb)}${Number(plan.planCompleto)}`;
const label = (plan: BusinessPlan) =>
  `pdf=${plan.planPdf} web=${plan.planWeb} completo=${plan.planCompleto}`;

// Lo que tiene que responder cada servicio, según la regla (RUTAS-5).
const expected = {
  interactivoSubdominio: (p: BusinessPlan) => p.planCompleto,
  interactivoPath: () => false,
  estaticoSubdominio: (p: BusinessPlan) => p.planWeb && p.planCompleto,
  estaticoPath: (p: BusinessPlan) => p.planWeb && !p.planCompleto,
  pdfSubdominio: (p: BusinessPlan) => p.planPdf && p.planCompleto,
  pdfPath: (p: BusinessPlan) => p.planPdf && !p.planCompleto,
};

async function menu(slug: string, viaPath: boolean, isStatic: boolean) {
  const r = await asUser(db, null, `select public.public_menu('${slug}', ${viaPath}, ${isStatic}) as m`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].m !== null;
}

async function pdf(slug: string, viaPath: boolean) {
  const r = await asUser(db, null, `select public.public_business_pdf('${slug}', ${viaPath}) as p`);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0].p !== null;
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: SUPER, email: "super@sma.com" });
  await db.exec(`insert into super_admins (user_id) values ('${SUPER}')`);

  for (const plan of COMBOS) {
    const slug = slugOf(plan);
    const id = `${COMBOS.indexOf(plan) + 1}0000000-0000-0000-0000-000000000001`;
    await db.exec(`
      insert into businesses (id, name, slug, plan_pdf, plan_web, plan_completo)
        values ('${id}', '${slug}', '${slug}', ${plan.planPdf}, ${plan.planWeb}, ${plan.planCompleto});
      insert into business_settings (business_id, published, menu_pdf_url)
        values ('${id}', true, 'https://cdn.example.com/${slug}.pdf');
      insert into categories (id, business_id, name)
        values ('c${COMBOS.indexOf(plan) + 1}000000-0000-0000-0000-000000000001', '${id}', 'Bebidas');
      insert into products (business_id, category_id, name, price)
        values ('${id}', 'c${COMBOS.indexOf(plan) + 1}000000-0000-0000-0000-000000000001', 'Café', 1000);
    `);
  }
}, 60_000);

describe("los tres servicios son independientes — RUTAS-5", () => {
  it.each(COMBOS.map((plan) => [label(plan), plan] as const))(
    "%s: cada servicio responde solo donde corresponde",
    async (_name, plan) => {
      const slug = slugOf(plan);

      expect(await menu(slug, false, false), "interactivo por subdominio").toBe(expected.interactivoSubdominio(plan));
      expect(await menu(slug, true, false), "interactivo por path").toBe(expected.interactivoPath());
      expect(await menu(slug, false, true), "estático por subdominio").toBe(expected.estaticoSubdominio(plan));
      expect(await menu(slug, true, true), "estático por path").toBe(expected.estaticoPath(plan));
      expect(await pdf(slug, false), "PDF por subdominio").toBe(expected.pdfSubdominio(plan));
      expect(await pdf(slug, true), "PDF por path").toBe(expected.pdfPath(plan));
    },
  );

  it("plan_completo solo no habilita el estático ni el PDF", async () => {
    const solo = { planPdf: false, planWeb: false, planCompleto: true };
    expect(await menu(slugOf(solo), false, true)).toBe(false);
    expect(await menu(slugOf(solo), true, true)).toBe(false);
    expect(await pdf(slugOf(solo), false)).toBe(false);
    expect(await pdf(slugOf(solo), true)).toBe(false);
    expect(await menu(slugOf(solo), false, false)).toBe(true);
  });

  it("sin el parámetro p_static el menú es el interactivo (los llamadores de siempre)", async () => {
    const r = await asUser(db, null, "select public.public_menu('n-001') as m, public.public_menu('n-010') as s");
    expect(r.ok && r.rows[0].m).not.toBeNull();
    expect(r.ok && r.rows[0].s).toBeNull();
  });

  it("published, active y la suspensión siguen mandando", async () => {
    const full = { planPdf: true, planWeb: true, planCompleto: true };
    const slug = slugOf(full);

    await db.exec(`update business_settings set published = false where business_id = (select id from businesses where slug = '${slug}')`);
    expect(await menu(slug, false, true)).toBe(false);
    expect(await menu(slug, false, false)).toBe(false);
    // El PDF no depende de published (PDF-1).
    expect(await pdf(slug, false)).toBe(true);
    await db.exec(`update business_settings set published = true where business_id = (select id from businesses where slug = '${slug}')`);

    // Solo un superadmin cambia el estado del negocio.
    await asUser(db, SUPER, `update businesses set active = false where slug = '${slug}'`);
    expect(await menu(slug, false, true)).toBe(false);
    expect(await pdf(slug, false)).toBe(false);
    await asUser(db, SUPER, `update businesses set active = true where slug = '${slug}'`);
    expect(await menu(slug, false, true)).toBe(true);
  });
});

describe("el panel muestra lo que responde — ADMIN-CONFIG-10", () => {
  it.each(COMBOS.map((plan) => [label(plan), plan] as const))(
    "%s: menuLinks() tiene un link por cada servicio que la base sirve, en la ruta que la base sirve",
    async (_name, plan) => {
      const slug = slugOf(plan);
      const links = menuLinks(slug, plan);
      const bySubdomain = (url: string | null) => url !== null && url.startsWith(`https://${slug}.`);
      const byPath = (url: string | null) => url !== null && url.startsWith(`https://smaalacarta.com.ar/${slug}/`);

      // El interactivo existe por subdominio o no existe.
      expect(links.interactivo !== null).toBe(await menu(slug, false, false));
      expect(links.interactivo === null || bySubdomain(links.interactivo)).toBe(true);

      // Estático y PDF: hay link si y solo si la base responde, y por la ruta que responde.
      expect(bySubdomain(links.estatico)).toBe(await menu(slug, false, true));
      expect(byPath(links.estatico)).toBe(await menu(slug, true, true));
      expect(bySubdomain(links.pdf)).toBe(await pdf(slug, false));
      expect(byPath(links.pdf)).toBe(await pdf(slug, true));
    },
  );
});
