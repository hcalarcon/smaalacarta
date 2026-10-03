"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import CategoryDialog from "./dialogs/CategoryDialog";
import CategorySection from "@/components/menu/CategorySection";
import CreateCategoryButton from "@/components/menu/CreateCategoryButton";
import { SortableItem, SortableList } from "@/components/menu/Sortable";

import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
} from "../actions/categories";

import ConfirmDeleteDialog from "../../components/ConfirmDeleteDialog";
import { Product } from "@/lib/db/products";
import {
  createProductAction,
  deleteProductAction,
  reorderProductsAction,
  setProductActiveAction,
  setProductSoldOutAction,
  updateProductAction,
} from "../actions/products";
import {
  pickTranslations,
  type Translations,
} from "@/lib/menu/translations";
import { matchesStatusFilter, type StatusFilter } from "@/lib/menu/product-fields";
import ProductDialog from "./dialogs/ProductDialog";

type Category = {
  id: string;
  name: string;
  description?: string | null;
  active?: boolean;
  name_en?: string | null;
  name_pt?: string | null;
  description_en?: string | null;
  description_pt?: string | null;
  products?: Product[];
};

type MenuClientProps = {
  businessId: string;
  initialCategories: Category[];
};

// Sin tildes ni mayúsculas, para que buscar "papas" encuentre "Papás".
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export default function MenuClient({
  businessId,
  initialCategories,
}: MenuClientProps) {
  const router = useRouter();

  const [categories, setCategories] = useState(initialCategories);

  // Cuando el servidor manda datos nuevos (después de `router.refresh()`), se
  // reemplaza el estado local. Se hace al renderizar y no en un efecto, que es
  // como React pide sincronizar estado con props.
  const [syncedFrom, setSyncedFrom] = useState(initialCategories);
  if (syncedFrom !== initialCategories) {
    setSyncedFrom(initialCategories);
    setCategories(initialCategories);
  }

  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(
    null,
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {},
  );

  const hasCategories = categories.length > 0;
  const filtering = search.trim().length > 0 || statusFilter !== "all";
  const normalizedSearch = normalize(search.trim());

  // Con un buscador o filtro activo, cada categoría muestra solo lo que
  // coincide (o todos sus productos si coincide el nombre de la categoría).
  const displayCategories = categories
    .map((category) => {
      let products = category.products ?? [];

      if (statusFilter !== "all") {
        products = products.filter((product) =>
          matchesStatusFilter(product, statusFilter),
        );
      }

      if (normalizedSearch) {
        const categoryMatches = normalize(category.name).includes(
          normalizedSearch,
        );

        if (!categoryMatches) {
          products = products.filter(
            (product) =>
              normalize(product.name).includes(normalizedSearch) ||
              normalize(product.description ?? "").includes(normalizedSearch),
          );
        }
      }

      return { ...category, products };
    })
    .filter((category) => !filtering || (category.products?.length ?? 0) > 0);

  function handleToggleCategory(categoryId: string, open: boolean) {
    setOpenCategories((prev) => ({ ...prev, [categoryId]: open }));
  }

  // Ejecuta un cambio y, si falla, vuelve a pedir el menú al servidor para no
  // dejar en pantalla algo que no se guardó.
  async function run(change: () => Promise<void>) {
    setError(null);

    try {
      await change();
    } catch {
      setError("No pudimos guardar el cambio. Volvimos a cargar el menú.");
    }

    router.refresh();
  }

  function updateProducts(
    categoryId: string,
    change: (products: Product[]) => Product[],
  ) {
    setCategories((prev) =>
      prev.map((category) =>
        category.id === categoryId
          ? { ...category, products: change(category.products ?? []) }
          : category,
      ),
    );
  }

  // Categorías
  function handleCreateCategory() {
    setEditingCategory(null);
    setDialogOpen(true);
  }

  function handleEditCategory(category: Category) {
    setEditingCategory(category);
    setDialogOpen(true);
  }

  async function handleCategorySubmit(data: {
    id?: string;
    name: string;
    description?: string;
    active: boolean;
  } & Translations) {
    if (data.id) {
      await updateCategoryAction(businessId, data.id, {
        name: data.name,
        description: data.description,
        active: data.active,
        ...pickTranslations(data),
      });
    } else {
      await createCategoryAction(businessId, {
        name: data.name,
        description: data.description,
        active: data.active,
        ...pickTranslations(data),
      });
    }

    setDialogOpen(false);
    router.refresh();
  }

  function handleDeleteCategory(category: Category) {
    setCategoryToDelete(category);
    setDeleteDialogOpen(true);
  }

  async function confirmDeleteCategory() {
    if (!categoryToDelete) return;

    try {
      setIsDeleting(true);

      await deleteCategoryAction(businessId, categoryToDelete.id);

      setCategories((prev) =>
        prev.filter((category) => category.id !== categoryToDelete.id),
      );

      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

  function handleReorderCategories(orderedIds: string[]) {
    setCategories((prev) =>
      orderedIds
        .map((id) => prev.find((category) => category.id === id))
        .filter((category): category is Category => !!category),
    );

    void run(() => reorderCategoriesAction(businessId, orderedIds));
  }

  // Productos
  function handleCreateProduct(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setEditingProduct(null);
    setProductDialogOpen(true);
  }

  async function handleProductSubmit(data: {
    id?: string;
    category_id: string | null;
    name: string;
    description?: string;
    price: number;
    active: boolean;
    image_url: string | null;
    featured: boolean;
    sold_out: boolean;
  } & Translations) {
    if (data.id) {
      await updateProductAction(businessId, data.id, {
        name: data.name,
        description: data.description,
        price: data.price,
        active: data.active,
        image_url: data.image_url,
        featured: data.featured,
        sold_out: data.sold_out,
        ...pickTranslations(data),
      });
    } else {
      // Un producto nuevo siempre nace dentro de una categoría (ADMIN-MENU-1).
      if (!data.category_id) return;

      await createProductAction(businessId, {
        category_id: data.category_id,
        name: data.name,
        description: data.description,
        price: data.price,
        active: data.active,
        image_url: data.image_url,
        featured: data.featured,
        sold_out: data.sold_out,
        ...pickTranslations(data),
      });
    }

    setProductDialogOpen(false);
    router.refresh();
  }

  function handleEditProduct(product: Product) {
    setEditingProduct(product);
    setProductDialogOpen(true);
  }

  function handleToggleProduct(product: Product) {
    const active = !product.active;

    if (product.category_id) {
      updateProducts(product.category_id, (products) =>
        products.map((p) => (p.id === product.id ? { ...p, active } : p)),
      );
    }

    void run(() => setProductActiveAction(businessId, product.id, active));
  }

  // Sin stock, igual que Activar/Desactivar: se ve al instante y, si falla, se vuelve a pedir el menú.
  function handleToggleSoldOut(product: Product) {
    const sold_out = !product.sold_out;

    if (product.category_id) {
      updateProducts(product.category_id, (products) =>
        products.map((p) => (p.id === product.id ? { ...p, sold_out } : p)),
      );
    }

    void run(() => setProductSoldOutAction(businessId, product.id, sold_out));
  }

  async function confirmDeleteProduct() {
    if (!productToDelete) return;

    const product = productToDelete;

    try {
      setIsDeleting(true);

      await deleteProductAction(businessId, product.id);

      if (product.category_id) {
        updateProducts(product.category_id, (products) =>
          products.filter((p) => p.id !== product.id),
        );
      }

      setProductToDelete(null);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

  function handleReorderProducts(categoryId: string, orderedIds: string[]) {
    updateProducts(categoryId, (products) =>
      orderedIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => !!p),
    );

    void run(() => reorderProductsAction(businessId, orderedIds));
  }

  return (
    <>
      <div className="space-y-6">
        {/* En escritorio ya está el nombre de la sección en el sidebar. */}
        <section className="lg:hidden">
          <h1 className="text-3xl font-bold text-brand">Menú</h1>

          <p className="mt-2 text-stone-500">
            Administrá productos y categorías. Arrastrá el asa ⠿ para cambiar
            el orden.
          </p>
        </section>

        {hasCategories ? (
          <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto o categoría…"
              className="w-full rounded-xl border border-line-strong bg-white px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:max-w-xs"
            />

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["all", "Todos"],
                  ["active", "Activos"],
                  ["hidden", "Ocultos"],
                  ["sold_out", "Sin stock"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  aria-pressed={statusFilter === key}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    statusFilter === key
                      ? "bg-brand text-white"
                      : "border border-line-strong bg-white text-stone-600 hover:bg-brand-soft"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        {hasCategories ? (
          displayCategories.length > 0 ? (
            <>
              <div className="space-y-4">
                {filtering ? (
                  displayCategories.map((category) => (
                    <CategorySection
                      key={category.id}
                      category={category}
                      open
                      onToggle={() => {}}
                      sortable={false}
                      onDelete={() => handleDeleteCategory(category)}
                      onEdit={() => handleEditCategory(category)}
                      onCreateProduct={() => handleCreateProduct(category.id)}
                      onEditProduct={handleEditProduct}
                      onDeleteProduct={setProductToDelete}
                      onToggleProduct={handleToggleProduct}
                      onToggleSoldOut={handleToggleSoldOut}
                      onReorderProducts={() => {}}
                    />
                  ))
                ) : (
                  <SortableList
                    ids={categories.map((category) => category.id)}
                    onReorder={handleReorderCategories}
                  >
                    {categories.map((category) => (
                      <SortableItem key={category.id} id={category.id}>
                        {(categoryHandle) => (
                          <CategorySection
                            category={category}
                            handle={categoryHandle}
                            open={openCategories[category.id] ?? true}
                            onToggle={(open) =>
                              handleToggleCategory(category.id, open)
                            }
                            onDelete={() => handleDeleteCategory(category)}
                            onEdit={() => handleEditCategory(category)}
                            onCreateProduct={() =>
                              handleCreateProduct(category.id)
                            }
                            onEditProduct={handleEditProduct}
                            onDeleteProduct={setProductToDelete}
                            onToggleProduct={handleToggleProduct}
                            onToggleSoldOut={handleToggleSoldOut}
                            onReorderProducts={(ids) =>
                              handleReorderProducts(category.id, ids)
                            }
                          />
                        )}
                      </SortableItem>
                    ))}
                  </SortableList>
                )}
              </div>

              <CreateCategoryButton onClick={handleCreateCategory} />
            </>
          ) : (
            <p className="rounded-2xl border border-dashed border-line-strong bg-white p-6 text-center text-sm text-stone-500">
              No encontramos productos ni categorías que coincidan.
            </p>
          )
        ) : (
          <CreateCategoryButton empty onClick={handleCreateCategory} />
        )}
      </div>

      <CategoryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={editingCategory ? "edit" : "create"}
        initialData={editingCategory ?? undefined}
        onSubmit={handleCategorySubmit}
      />

      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setCategoryToDelete(null);
        }}
        onConfirm={confirmDeleteCategory}
        loading={isDeleting}
        title="Eliminar categoría"
        description={`¿Seguro que querés eliminar "${categoryToDelete?.name}"? Sus productos quedan sin categoría.`}
      />

      <ConfirmDeleteDialog
        open={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={confirmDeleteProduct}
        loading={isDeleting}
        title="Eliminar producto"
        description={`¿Seguro que querés eliminar "${productToDelete?.name}"? También sale de las promociones que lo incluyen.`}
      />

      <ProductDialog
        open={productDialogOpen}
        onClose={() => {
          setProductDialogOpen(false);
          setEditingProduct(null);
        }}
        mode={editingProduct ? "edit" : "create"}
        initialData={editingProduct ?? undefined}
        categoryId={selectedCategoryId}
        businessId={businessId}
        onSubmit={handleProductSubmit}
      />
    </>
  );
}
