import { describe, expect, it } from "vitest";

import { promotionImage } from "./image";

const products = [
  { id: "p1", imageUrl: null },
  { id: "p2", imageUrl: "https://x/p2.jpg" },
  { id: "p3", imageUrl: "https://x/p3.jpg" },
];

describe("promotionImage — ADMIN-PROMO-1", () => {
  it("la propia gana", () => {
    expect(promotionImage({ imageUrl: "https://x/promo.jpg", imageProductId: "p3", products })).toBe(
      "https://x/promo.jpg",
    );
  });

  it("sin propia, la del producto elegido", () => {
    expect(promotionImage({ imageUrl: null, imageProductId: "p3", products })).toBe("https://x/p3.jpg");
  });

  it("si el elegido no tiene foto, la del primer producto que tenga", () => {
    expect(promotionImage({ imageUrl: "", imageProductId: "p1", products })).toBe("https://x/p2.jpg");
  });

  it("sin nada elegido, la del primer producto que tenga", () => {
    expect(promotionImage({ imageUrl: null, imageProductId: null, products })).toBe("https://x/p2.jpg");
  });

  it("si ninguno tiene foto, no hay imagen", () => {
    expect(promotionImage({ imageUrl: null, imageProductId: null, products: [{ id: "a", imageUrl: null }] })).toBeNull();
    expect(promotionImage({ imageUrl: null, imageProductId: null, products: [] })).toBeNull();
  });
});
