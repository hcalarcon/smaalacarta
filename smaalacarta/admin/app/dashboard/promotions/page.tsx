export default function PromotionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Promociones</h1>

        <p className="mt-2 text-slate-500">Gestión de promociones.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        Próximamente promociones.
      </div>
    </div>
  );
}

// import { redirect } from "next/navigation";

// import ResourceForm, {
//   FieldDefinition,
// } from "../../../src/components/resource/ResourceForm";
// import ResourceList from "../../../src/components/resource/ResourceList";
// import { getCurrentBusiness } from "@/lib/get-current-business";
// import {
//   createPromotion,
//   deletePromotion,
//   getPromotion,
//   getPromotions,
//   updatePromotion,
// } from "@/lib/db/promotions";

// export default async function PromotionsPage({
//   searchParams,
// }: {
//   searchParams: { edit?: string | string[] };
// }) {
//   const current = await getCurrentBusiness();
//   if (!current) {
//     redirect("/login");
//   }

//   const businessId = current.business.id;
//   const promotions = await getPromotions(businessId);
//   const editId = Array.isArray(searchParams.edit)
//     ? searchParams.edit[0]
//     : searchParams.edit;
//   const editItem = editId ? await getPromotion(businessId, editId) : null;

//   async function createAction(form: FormData) {
//     const name = String(form.get("name") ?? "").trim();
//     const description = String(form.get("description") ?? "").trim();
//     const discountPercent = Number(form.get("discount_percent") ?? 0);
//     const active = form.get("active") === "on";

//     if (!name) {
//       redirect("/dashboard/promotions");
//     }

//     await createPromotion(businessId, {
//       name,
//       description,
//       discount_percent: discountPercent,
//       active,
//     });
//     redirect("/dashboard/promotions");
//   }

//   async function updateAction(form: FormData) {
//     const id = String(form.get("id") ?? "").trim();
//     const name = String(form.get("name") ?? "").trim();
//     const description = String(form.get("description") ?? "").trim();
//     const discountPercent = Number(form.get("discount_percent") ?? 0);
//     const active = form.get("active") === "on";

//     if (!id || !name) {
//       redirect("/dashboard/promotions");
//     }

//     await updatePromotion(businessId, id, {
//       name,
//       description,
//       discount_percent: discountPercent,
//       active,
//     });
//     redirect("/dashboard/promotions");
//   }

//   async function deleteAction(form: FormData) {
//     const id = String(form.get("id") ?? "").trim();
//     if (id) {
//       await deletePromotion(businessId, id);
//     }
//     redirect("/dashboard/promotions");
//   }

//   const fields: FieldDefinition[] = [
//     {
//       name: "name",
//       label: "Nombre",
//       type: "text",
//       required: true,
//       placeholder: "Ej. Promoción de verano",
//     },
//     {
//       name: "description",
//       label: "Descripción",
//       type: "textarea",
//       placeholder: "Descripción opcional",
//     },
//     {
//       name: "discount_percent",
//       label: "Descuento (%)",
//       type: "number",
//       required: true,
//       min: "0",
//       step: "0.01",
//       placeholder: "10.00",
//     },
//   ];

//   return (
//     <div className="space-y-6 px-4 py-6 sm:px-8">
//       <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm shadow-slate-200/40 backdrop-blur-lg">
//         <h1 className="text-2xl font-semibold text-slate-900">Promociones</h1>
//         <p className="mt-2 text-sm text-slate-600">
//           Controla descuentos y campañas activas para tu negocio.
//         </p>
//       </div>

//       <ResourceForm
//         title={editItem ? "Editar promoción" : "Nueva promoción"}
//         action={editItem ? updateAction : createAction}
//         submitLabel={editItem ? "Guardar cambios" : "Crear promoción"}
//         fields={fields}
//         initialValues={
//           editItem
//             ? {
//                 name: editItem.name,
//                 description: editItem.description ?? "",
//                 discount_percent: editItem.discount_percent,
//                 active: editItem.active,
//               }
//             : undefined
//         }
//         editId={editItem?.id ?? undefined}
//         basePath="/dashboard/promotions"
//       />

//       <ResourceList
//         title="Listado de promociones"
//         records={promotions}
//         labels={{ primary: "name", secondary: "description" }}
//         basePath="/dashboard/promotions"
//         deleteAction={deleteAction}
//       />
//     </div>
//   );
// }
