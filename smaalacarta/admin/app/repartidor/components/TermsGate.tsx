"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import TermsText from "./TermsText";
import { acceptTermsAction } from "../actions";
import { TERMS_TEXTS, type TermsLang } from "@/lib/courier/terms";

// La pantalla de términos (ENVIO-183): reemplaza al panel hasta que el repartidor acepta la versión vigente.
// Los textos de la pantalla van en es/en/pt; los términos, solo en español.
export default function TermsGate({ body, version, lang }: { body: string; version: number; lang: TermsLang }) {
  const router = useRouter();
  const text = TERMS_TEXTS[lang];

  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);

    try {
      const result = await acceptTermsAction(version);

      if (!result.ok) {
        setError(text.error);
        return;
      }

      router.refresh();
    } catch {
      setError(text.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5 rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">{text.title}</h1>
        <p className="mt-1 text-sm text-stone-600">{text.intro}</p>
        {text.onlySpanish ? <p className="mt-1 text-sm text-stone-500">{text.onlySpanish}</p> : null}
      </div>

      <TermsText body={body} />

      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
        />
        <span className="font-medium text-stone-800">{text.check}</span>
      </label>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!checked || pending}
        onClick={accept}
        className="min-h-11 w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {pending ? text.accepting : text.accept}
      </button>
    </section>
  );
}
