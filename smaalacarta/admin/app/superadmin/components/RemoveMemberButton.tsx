"use client";

import { removeMemberAction } from "../actions";

export default function RemoveMemberButton({
  businessId,
  userId,
  label,
}: {
  businessId: string;
  userId: string;
  label: string;
}) {
  return (
    <form
      action={removeMemberAction}
      onSubmit={(event) => {
        if (!window.confirm(`¿Quitar a ${label} de este negocio?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
      >
        Quitar
      </button>
    </form>
  );
}
