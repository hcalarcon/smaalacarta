import { redirect } from "next/navigation";

import ResourceForm, {
  FieldDefinition,
} from "../../../src/components/resource/ResourceForm";
import ResourceList from "../../../src/components/resource/ResourceList";
import { requireBusiness } from "@/lib/get-current-business";
import {
  createProduct,
  deleteProduct,
  getProduct,
  getProducts,
  updateProduct,
} from "@/lib/db/products";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { edit?: string | string[] };
}) {
  const current = await requireBusiness();

  const businessId = current.business.id;
  const products = await getProducts(businessId);
  const editId = Array.isArray(searchParams.edit)
    ? searchParams.edit[0]
    : searchParams.edit;
  const editItem = editId ? await getProduct(businessId, editId) : null;

  async function createAction(form: FormData) {
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const price = Number(form.get("price") ?? 0);
    const active = form.get("active") === "on";

    if (!name) {
      redirect("/dashboard/products");
    }

    await createProduct(businessId, { name, description, price, active });
    redirect("/dashboard/products");
  }

  async function updateAction(form: FormData) {
    const id = String(form.get("id") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const price = Number(form.get("price") ?? 0);
    const active = form.get("active") === "on";

    if (!id || !name) {
      redirect("/dashboard/products");
    }

    await updateProduct(businessId, id, { name, description, price, active });
    redirect("/dashboard/products");
  }

  async function deleteAction(form: FormData) {
    const id = String(form.get("id") ?? "").trim();
    if (id) {
      await deleteProduct(businessId, id);
    }
    redirect("/dashboard/products");
  }

  const fields: FieldDefinition[] = [
    {
      name: "name",
      label: "Nombre",
      type: "text",
      required: true,
      placeholder: "Ej. Café",
    },
    {
      name: "description",
      label: "Descripción",
      type: "textarea",
      placeholder: "Descripción opcional",
    },
    {
      name: "price",
      label: "Precio",
      type: "number",
      required: true,
      min: "0",
      step: "0.01",
      placeholder: "99.90",
    },
  ];

  return (
    <div className="space-y-6 px-4 py-6 sm:px-8">
      <div className="rounded-3xl border border-line bg-white/90 p-6 shadow-sm shadow-stone-200/40 backdrop-blur-lg">
        <h1 className="text-2xl font-semibold text-brand">Productos</h1>
        <p className="mt-2 text-sm text-stone-600">
          Gestiona el catálogo de productos de tu negocio.
        </p>
      </div>

      <ResourceForm
        title={editItem ? "Editar producto" : "Nuevo producto"}
        action={editItem ? updateAction : createAction}
        submitLabel={editItem ? "Guardar cambios" : "Crear producto"}
        fields={fields}
        initialValues={
          editItem
            ? {
                name: editItem.name,
                description: editItem.description ?? "",
                price: editItem.price,
                active: editItem.active,
              }
            : undefined
        }
        editId={editItem?.id ?? undefined}
        basePath="/dashboard/products"
      />

      <ResourceList
        title="Listado de productos"
        records={products}
        labels={{ primary: "name", secondary: "description" }}
        basePath="/dashboard/products"
        deleteAction={deleteAction}
      />
    </div>
  );
}
