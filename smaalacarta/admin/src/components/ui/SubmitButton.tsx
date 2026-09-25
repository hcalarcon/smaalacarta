"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white transition hover:-translate-y-px hover:bg-brand-hover hover:shadow-md disabled:translate-y-0 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
