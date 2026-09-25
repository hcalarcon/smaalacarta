"use client";

import { useEffect, useState } from "react";

import CategoryDialog from "./dialogs/CategoryDialog";
import CategorySection from "@/components/menu/CategorySection";
import CreateCategoryButton from "@/components/menu/CreateCategoryButton";

import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "../actions/categories";

import ConfirmDeleteDialog from "../../components/ConfirmDeleteDialog";
import { Product } from "@/lib/db/products";
import { createProductAction, updateProductAction } from "../actions/products";
import ProductDialog from "./dialogs/ProductDialog";

type Category = {
  id: string;
  name: string;
  description?: string | null;
  active?: boolean;
};

type MenuClientProps = {
  businessId: string;
  initialCategories: Category[];
};

export default function MenuClient({
  businessId,
  initialCategories,
}: MenuClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [categories, setCategories] = useState(initialCategories);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(
    null,
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const hasCategories = categories.length > 0;

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

      setCategories((prev) =>
        prev.map((category) =>
          category.id === data.id
            ? {
                ...category,
                name: data.name,
                description: data.description,
                active: data.active,
              }
            : category,
        ),
      );

      setDialogOpen(false);

      return;
    }

    await createCategoryAction(businessId, {
      name: data.name,
      description: data.description,
      active: data.active,
    });

    setDialogOpen(false);

    location.reload();
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
    } finally {
      setIsDeleting(false);
    }
  }

  // Productos
  function handleCreateProduct(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setEditingProduct(null);
    setProductDialogOpen(true);
  }

  async function handleProductSubmit(data: {
    id?: string;
    category_id: string;
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

      setProductDialogOpen(false);
      location.reload();

      return;
    }

    await createProductAction(businessId, {
      category_id: data.category_id,
      name: data.name,
      description: data.description,
      price: data.price,
      active: data.active,
    });

    setProductDialogOpen(false);
    location.reload();
  }

  function handleEditProduct(product: Product) {
    setEditingProduct(product);
    console.log(editingProduct, product);
    setProductDialogOpen(true);
  }

  return (
    <>
      <div className="space-y-10">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-brand">Menú</h1>

            <p className="mt-2 text-stone-500">
              Administra productos y categorías.
            </p>
          </div>
        </section>

        {hasCategories ? (
          <>
            {categories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                onDelete={() => handleDeleteCategory(category)}
                onEdit={() => handleEditCategory(category)}
                onCreateProduct={() => handleCreateProduct(category.id)}
                onEditProduct={handleEditProduct}
                onToggleProduct={() => console.log("asd")}
              />
            ))}

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
        description={`¿Seguro que deseas eliminar "${categoryToDelete?.name}"?`}
      />

      <ProductDialog
        open={productDialogOpen}
        onClose={() => {
          setProductDialogOpen(false);
          setEditingProduct(null);
        }}
        mode={editingProduct ? "edit" : "create"}
        initialData={editingProduct ?? undefined}
        onSubmit={handleProductSubmit}
      />
    </>
  );
}
