import {
  getRecord,
  getRecords,
  insertRecord,
  updateRecord,
  deleteRecord,
} from "@/lib/db/resources";

export type Order = {
  id: string;
  business_id: string;
  order_number: string;
  status: string;
  total: number;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function getOrders(businessId: string) {
  return getRecords<Order>("orders", businessId);
}

export async function getOrder(businessId: string, id: string) {
  return getRecord<Order>("orders", businessId, id);
}

export async function createOrder(
  businessId: string,
  payload: {
    order_number: string;
    status: string;
    total: number;
    notes?: string;
    active?: boolean;
  },
) {
  await insertRecord("orders", {
    business_id: businessId,
    order_number: payload.order_number,
    status: payload.status,
    total: payload.total,
    notes: payload.notes || null,
    active: payload.active ?? true,
  });
}

export async function updateOrder(
  businessId: string,
  id: string,
  payload: {
    order_number: string;
    status: string;
    total: number;
    notes?: string;
    active?: boolean;
  },
) {
  await updateRecord("orders", id, businessId, {
    order_number: payload.order_number,
    status: payload.status,
    total: payload.total,
    notes: payload.notes || null,
    active: payload.active ?? true,
  });
}

export async function deleteOrder(businessId: string, id: string) {
  await deleteRecord("orders", businessId, id);
}
