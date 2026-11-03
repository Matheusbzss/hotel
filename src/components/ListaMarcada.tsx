/** Uma lista com título e um sinal em cada item: ✓ para o que tem ou inclui, ✕ para o que não. */
export function ListaMarcada({ titulo, id, itens, marca }: { titulo: string; id: string; itens: string[]; marca: 'sim' | 'nao' }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lead font-semibold">
        {titulo}
      </h2>
      <ul className="mt-4 space-y-2.5">
        {itens.map((i) => (
          <li key={i} className="flex gap-3">
            <svg viewBox="0 0 24 24" className="mt-1 size-5 shrink-0" fill="currentColor" aria-hidden="true">
              {marca === 'sim' ? (
                <path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z" />
              ) : (
                <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6Z" />
              )}
            </svg>
            {i}
          </li>
        ))}
      </ul>
    </section>
  );
}
