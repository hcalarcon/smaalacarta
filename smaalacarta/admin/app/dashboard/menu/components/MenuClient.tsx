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
  updateProductAction,
} from "../actions/products";
import ProductDialog from "./dialogs/ProductDialog";

type Category = {
  id: string;
  name: string;
  description?: string | null;
  active?: boolean;
  products?: Product[];
};

type MenuClientProps = {
  businessId: string;
  initialCategories: Category[];
};

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

  const hasCategories = categories.length > 0;

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
  }) {
    if (data.id) {
      await updateCategoryAction(businessId, data.id, {
        name: data.name,
        description: data.description,
        active: data.active,
      });
    } else {
      await createCategoryAction(businessId, {
        name: data.name,
        description: data.description,
        active: data.active,
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
  }) {
    if (data.id) {
      await updateProductAction(businessId, data.id, {
        name: data.name,
        description: data.description,
        price: data.price,
        active: data.active,
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
      <div className="space-y-10">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-brand">Menú</h1>

            <p className="mt-2 text-stone-500">
              Administrá productos y categorías. Arrastrá el asa ⠿ para
              cambiar el orden.
            </p>
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        {hasCategories ? (
          <>
            <div className="space-y-6">
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
                        onDelete={() => handleDeleteCategory(category)}
                        onEdit={() => handleEditCategory(category)}
                        onCreateProduct={() => handleCreateProduct(category.id)}
                        onEditProduct={handleEditProduct}
                        onDeleteProduct={setProductToDelete}
                        onToggleProduct={handleToggleProduct}
                        onReorderProducts={(ids) =>
                          handleReorderProducts(category.id, ids)
                        }
                      />
                    )}
                  </SortableItem>
                ))}
              </SortableList>
            </div>

            <CreateCategoryButton onClick={handleCreateCategory} />
          </>
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
        onSubmit={handleProductSubmit}
      />
    </>
  );
}
