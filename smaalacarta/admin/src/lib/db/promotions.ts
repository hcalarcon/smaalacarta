import {
  getRecord,
  getRecords,
  insertRecord,
  updateRecord,
  deleteRecord,
} from "@/lib/db/resources";

export type Promotion = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  discount_percent: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function getPromotions(businessId: string) {
  return getRecords<Promotion>("promotions", businessId);
}

export async function getPromotion(businessId: string, id: string) {
  return getRecord<Promotion>("promotions", businessId, id);
}

export async function createPromotion(
  businessId: string,
  payload: {
    name: string;
    description?: string;
    discount_percent: number;
    active?: boolean;
  },
) {
  await insertRecord("promotions", {
    business_id: businessId,
    name: payload.name,
    description: payload.description || null,
    discount_percent: payload.discount_percent,
    active: payload.active ?? true,
  });
}

export async function updatePromotion(
  businessId: string,
  id: string,
  payload: {
    name: string;
    description?: string;
    discount_percent: number;
    active?: boolean;
  },
) {
  await updateRecord("promotions", id, businessId, {
    name: payload.name,
    description: payload.description || null,
    discount_percent: payload.discount_percent,
    active: payload.active ?? true,
  });
}

export async function deletePromotion(businessId: string, id: string) {
  await deleteRecord("promotions", businessId, id);
}
