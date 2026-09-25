export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand">Pedidos</h1>

        <p className="mt-2 text-stone-500">Administración de pedidos.</p>
      </div>

      <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        Próximamente tablero de pedidos.
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
//   createOrder,
//   deleteOrder,
//   getOrder,
//   getOrders,
//   updateOrder,
// } from "@/lib/db/orders";

// export default async function OrdersPage({
//   searchParams,
// }: {
//   searchParams: { edit?: string | string[] };
// }) {
//   const current = await getCurrentBusiness();
//   if (!current) {
//     redirect("/login");
//   }

//   const businessId = current.business.id;
//   const orders = await getOrders(businessId);
//   const editId = Array.isArray(searchParams.edit)
//     ? searchParams.edit[0]
//     : searchParams.edit;
//   const editItem = editId ? await getOrder(businessId, editId) : null;

//   async function createAction(form: FormData) {
//     const orderNumber = String(form.get("order_number") ?? "").trim();
//     const status = String(form.get("status") ?? "").trim();
//     const total = Number(form.get("total") ?? 0);
//     const notes = String(form.get("notes") ?? "").trim();
//     const active = form.get("active") === "on";

//     if (!orderNumber || !status) {
//       redirect("/dashboard/orders");
//     }

//     await createOrder(businessId, {
//       order_number: orderNumber,
//       status,
//       total,
//       notes,
//       active,
//     });
//     redirect("/dashboard/orders");
//   }

//   async function updateAction(form: FormData) {
//     const id = String(form.get("id") ?? "").trim();
//     const orderNumber = String(form.get("order_number") ?? "").trim();
//     const status = String(form.get("status") ?? "").trim();
//     const total = Number(form.get("total") ?? 0);
//     const notes = String(form.get("notes") ?? "").trim();
//     const active = form.get("active") === "on";

//     if (!id || !orderNumber || !status) {
//       redirect("/dashboard/orders");
//     }

//     await updateOrder(businessId, id, {
//       order_number: orderNumber,
//       status,
//       total,
//       notes,
//       active,
//     });
//     redirect("/dashboard/orders");
//   }

//   async function deleteAction(form: FormData) {
//     const id = String(form.get("id") ?? "").trim();
//     if (id) {
//       await deleteOrder(businessId, id);
//     }
//     redirect("/dashboard/orders");
//   }

//   const fields: FieldDefinition[] = [
//     {
//       name: "order_number",
//       label: "Número de orden",
//       type: "text",
//       required: true,
//       placeholder: "Ej. PED-0001",
//     },
//     {
//       name: "status",
//       label: "Estado",
//       type: "text",
//       required: true,
//       placeholder: "Ej. pendiente",
//     },
//     {
//       name: "total",
//       label: "Total",
//       type: "number",
//       required: true,
//       min: "0",
//       step: "0.01",
//       placeholder: "0.00",
//     },
//     {
//       name: "notes",
//       label: "Notas",
//       type: "textarea",
//       placeholder: "Notas opcionales",
//     },
//   ];

//   return (
//     <div className="space-y-6 px-4 py-6 sm:px-8">
//       <div className="rounded-3xl border border-line bg-white/90 p-6 shadow-sm shadow-stone-200/40 backdrop-blur-lg">
//         <h1 className="text-2xl font-semibold text-brand">Órdenes</h1>
//         <p className="mt-2 text-sm text-stone-600">
//           Administra el flujo de pedidos para tu negocio.
//         </p>
//       </div>

//       <ResourceForm
//         title={editItem ? "Editar orden" : "Nueva orden"}
//         action={editItem ? updateAction : createAction}
//         submitLabel={editItem ? "Guardar cambios" : "Crear orden"}
//         fields={fields}
//         initialValues={
//           editItem
//             ? {
//                 order_number: editItem.order_number,
//                 status: editItem.status,
//                 total: editItem.total,
//                 notes: editItem.notes ?? "",
//                 active: editItem.active,
//               }
//             : undefined
//         }
//         editId={editItem?.id ?? undefined}
//         basePath="/dashboard/orders"
//       />

//       <ResourceList
//         title="Listado de órdenes"
//         records={orders}
//         labels={{ primary: "order_number", secondary: "status" }}
//         basePath="/dashboard/orders"
//         deleteAction={deleteAction}
//       />
//     </div>
//   );
// }
