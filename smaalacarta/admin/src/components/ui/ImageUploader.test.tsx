import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ImageUploader from "./ImageUploader";

vi.mock("@/lib/supabase-browser", () => ({ createClient: () => ({}) }));

function setup(value: string) {
  const view = render(
    <ImageUploader businessId="b1" label="Logo" value={value} onChange={() => {}} />,
  );
  return (next: string) =>
    view.rerender(
      <ImageUploader businessId="b1" label="Logo" value={next} onChange={() => {}} />,
    );
}

describe("ImageUploader (ADMIN-CONFIG-24)", () => {
  it("pasar de una URL rota a una válida vuelve a mostrar la imagen", () => {
    const setValue = setup("https://x.test/rota.jpg");
    fireEvent.error(document.querySelector("img")!);
    expect(screen.getByText("Sin imagen")).toBeInTheDocument();

    setValue("https://x.test/ok.jpg");
    expect(document.querySelector("img")).toHaveAttribute(
      "src",
      "https://x.test/ok.jpg",
    );
    expect(screen.queryByText("Sin imagen")).toBeNull();
  });
});
