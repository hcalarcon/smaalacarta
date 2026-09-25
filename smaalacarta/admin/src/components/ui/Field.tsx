"use client";

import { useId, useState } from "react";

type FieldProps = Omit<React.ComponentProps<"input">, "id"> & {
  label: string;
  error?: string;
  hint?: string;
};

export default function Field({
  label,
  error,
  hint,
  type,
  className = "",
  ...inputProps
}: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-brand">
        {label}
      </label>

      <div className="relative">
        <input
          {...inputProps}
          id={id}
          type={isPassword && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={`w-full rounded-xl border bg-white px-4 py-3 text-base text-stone-900 placeholder:text-stone-400 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 ${
            error ? "border-red-500" : "border-line-strong"
          } ${isPassword ? "pr-20" : ""} ${className}`}
        />

        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 px-4 text-sm font-medium text-stone-500 hover:text-brand"
          >
            {visible ? "Ocultar" : "Mostrar"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={messageId} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-sm text-stone-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
