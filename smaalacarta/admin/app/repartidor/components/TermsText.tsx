import { termsBlocks } from "@/lib/courier/terms";

// El texto de los términos para repartidores (siempre en español). Sin HTML crudo: cada línea se pinta como texto.
export default function TermsText({ body }: { body: string }) {
  const blocks = termsBlocks(body);
  const title = blocks.find((block) => block.kind === "title");
  const items = blocks.filter((block) => block.kind === "item");

  return (
    <article lang="es" className="space-y-3">
      {title ? <h2 className="text-lg font-semibold text-brand">{title.text}</h2> : null}
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-stone-700">
        {items.map((item) => (
          <li key={item.text}>{item.text}</li>
        ))}
      </ol>
    </article>
  );
}
