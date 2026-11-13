import type { Dicionario } from '@/i18n';

/** Ícones de traço no peso dos outros do site (24 px, traço 1,75); as garantias da inicial usam os mesmos. */
export const ICONES = {
  cancelar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 3v4M16 3v4M4 10h16M10 13l4 4M14 13l-4 4',
  chuva: 'M12 2v1M3 12a9 9 0 0 1 18 0H3ZM12 12v6a2 2 0 0 1-4 0',
  voucher: 'M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6ZM14 6v12',
  pagamento: 'M12 3l7 3v5c0 4.4-2.9 8.2-7 10-4.1-1.8-7-5.6-7-10V6l7-3ZM9 12l2 2 4-4',
  // o cartão (Pix ou cartão, sem taxa escondida)
  cartao: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM3 10h18M7 15h4',
} as const;

/**
 * As garantias que tiram o risco da compra, perto do botão de reservar:
 * cancelamento grátis, reembolso se chover, voucher na hora e pagamento seguro.
 */
export function Confianca({ d, className = '' }: { d: Dicionario; className?: string }) {
  const [cancelar, chuva, voucher] = d.passeio.garantias;
  const itens: [keyof typeof ICONES, string][] = [
    ['cancelar', cancelar],
    ['chuva', chuva],
    ['voucher', voucher],
    ['pagamento', d.passeio.pagoSeguro],
  ];
  return (
    <ul className={`grid gap-x-5 gap-y-2.5 text-small ${className}`}>
      {itens.map(([icone, texto]) => (
        <li key={icone} className="flex items-center gap-2.5">
          <svg
            viewBox="0 0 24 24"
            className="size-5 shrink-0 text-(--color-turquesa-texto)"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={ICONES[icone]} />
          </svg>
          {texto}
        </li>
      ))}
    </ul>
  );
}
