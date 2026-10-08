import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HeaderPreview from "./HeaderPreview";

const show = (imageUrl: string) => (
  <HeaderPreview imageUrl={imageUrl} primaryColor="#111111" secondaryColor="#222222" />
);

describe("HeaderPreview (ADMIN-CONFIG-24)", () => {
  it("pasar de una URL rota a una válida vuelve a mostrar la imagen", () => {
    const view = render(show("https://x.test/rota.jpg"));
    fireEvent.error(document.querySelector("img")!);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/No pudimos cargar/)).toBeInTheDocument();

    view.rerender(show("https://x.test/ok.jpg"));
    expect(document.querySelector("img")).toHaveAttribute("src", "https://x.test/ok.jpg");
    expect(screen.queryByText(/No pudimos cargar/)).toBeNull();
  });
});
