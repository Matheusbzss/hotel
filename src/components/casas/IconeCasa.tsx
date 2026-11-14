import type { IconeCasa as NomeIcone } from '@/data/comodidades';

/**
 * Os ícones da página da casa, desenhados para o site: traço de 1,75 na grade de 24 px, pontas arredondadas, como os
 * das garantias (src/components/passeio/Confianca.tsx). Um desenho para cada ícone de ICONES_CASA
 * (src/data/comodidades.ts), mais os da interface (fotos, fechar, setas). Nenhum vem de outro site ou biblioteca.
 */
export const DESENHOS_CASA: Record<NomeIcone, string> = {
  // a janela com o peitoril, dividida ao meio, e a água na metade de baixo (não parece o ícone de "imagem")
  'vista-mar': 'M4 3.5h16v13H4ZM12 3.5v13M2.5 16.5h19M4 11.5q2-1.5 4 0t4 0 4 0 4 0',
  // o guarda-sol fincado na areia
  praia: 'M12 2.5V4M4 11.5a8 8 0 0 1 16 0ZM12 11.5V20M5 20.5h14',
  // a escada da piscina e a água
  piscina: 'M8 16V6.5a2.5 2.5 0 0 1 2.5-2.5M14 16V6.5a2.5 2.5 0 0 1 2.5-2.5M8 8.5h6M8 12.5h6M3 19.5q1.5-1.5 3 0t3 0 3 0 3 0 3 0 3 0',
  // o infinito sobre a água: a piscina de borda infinita (diferente da piscina comum)
  'borda-infinita':
    'M12 7.5c-1.2-1.6-2.4-2.5-3.7-2.5a2.5 2.5 0 0 0 0 5c1.3 0 2.5-.9 3.7-2.5Zm0 0c1.2 1.6 2.4 2.5 3.7 2.5a2.5 2.5 0 0 0 0-5c-1.3 0-2.5.9-3.7 2.5ZM3 15q1.5-1.5 3 0t3 0 3 0 3 0 3 0 3 0M3 19q1.5-1.5 3 0t3 0 3 0 3 0 3 0 3 0',
  // a banheira com as bolhas dos jatos (sem vapor: o aquecimento do spa não foi confirmado)
  spa: 'M3 12.5h18V15a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5ZM6.75 8.5a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 1 0-2.5 0M11 5.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M15 9a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
  // a churrasqueira redonda nos três pés
  churrasqueira: 'M4 9.5h16a8 8 0 0 1-16 0ZM8 16 6.5 21M16 16l1.5 5M10 3.5v3M14 3.5v3',
  // a panela com a tampa
  cozinha: 'M5 10.5h14V17a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3ZM3 10.5h18M10 7.5h4M12 7.5V5.5',
  // a panela debaixo do pergolado: a cozinha do lado de fora
  'cozinha-externa': 'M3 4.5h18M6 4.5V7M10 4.5V7M14 4.5V7M18 4.5V7M7 12.5h10V16a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3ZM5.5 12.5h13M12 10v2.5',
  // a taça
  bar: 'M5 4h14l-7 8.5ZM12 12.5V20M8.5 20h7M7.5 7h9',
  // a poltrona
  lounge: 'M8 11V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M6 11a2 2 0 0 1 2 2v1h8v-1a2 2 0 1 1 4 0v5H4v-5a2 2 0 0 1 2-2ZM6.5 19v1.5M17.5 19v1.5',
  // o piso de tábuas do deque, em perspectiva
  deck: 'M2 18.5h20L18.5 9h-13ZM9.5 9 8 18.5M14.5 9l1.5 9.5M4 18.5V21M20 18.5V21',
  // a chama sobre a lenha
  fogo: 'M12 3c2.6 2.6 5 5 5 8.5a5 5 0 0 1-10 0c0-2 1-3.6 2.5-4.6 0 1.6.8 2.6 2 2.6-.4-2.4 0-4.5.5-6.5ZM5 21l14-3M5 18l14 3',
  // a espreguiçadeira de perfil
  espreguicadeira: 'M3.5 7 8 15h13M9.5 15l-1 4.5M19 15l1 4.5',
  // a mesa: o tampo grosso e os pés recolhidos (sem a travessa de baixo, que lembrava um portal)
  mesa: 'M3 8.5h18V11H3ZM5.5 11v9M18.5 11v9',
  // o guarda-corpo, com o mar atrás
  varanda: 'M3 7.5q1.5-1.5 3 0t3 0 3 0 3 0 3 0 3 0M3 12h18M3 20h18M5 12v8M9.67 12v8M14.33 12v8M19 12v8',
  // a muda com duas folhas
  jardim: 'M12 20.5v-8.5M12 12c0-3.9 3.1-7 7-7 0 3.9-3.1 7-7 7ZM12 15c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5ZM7.5 20.5h9',
  // a rede entre dois mourões
  rede: 'M3.5 4v16.5M20.5 4v16.5M3.5 8.5q8.5 9 17 0M6 12.5q6 3.5 12 0',
  // o balanço
  parquinho: 'M3 20.5 7 4h10l4 16.5M10 4v10M14 4v10M8.5 14h7',
  // a garrafa e a taça
  adega: 'M6.5 21v-9c0-1.6 1.5-2.6 1.5-4V3h2.5v5c0 1.4 1.5 2.4 1.5 4v9ZM15 10.5h5l-.4 3a2.1 2.1 0 0 1-4.2 0ZM17.5 15.5V21M15.5 21h4',
  // o aparelho na parede e o ar saindo
  'ar-condicionado': 'M3 5h18v7H3ZM6.5 9h11M8 15c0 1.5-1 2-1 3.5M12 15c0 1.5-1 2-1 3.5M16 15c0 1.5-1 2-1 3.5',
  // as toalhas dobradas
  'roupa-de-cama': 'M4 6h14a2 2 0 0 1 0 4H4ZM5.5 10h14a2 2 0 0 1 0 4h-14ZM4 14h14a2 2 0 0 1 0 4H4Z',
  tv: 'M3 5h18v12H3ZM8 21h8M12 17v4',
  // o chuveiro de teto e as gotas
  chuveiro: 'M12 3v3M5 11.5a7 5.5 0 0 1 14 0ZM8 15v1M12 15v2M16 15v1M10 19v1M14 19v1',
  // a cuba com a torneira
  pia: 'M3 13h18v1a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6ZM10 13V8a3 3 0 0 1 6 0v.5',
  // a caixa de som
  som: 'M6 3h12v18H6ZM9 14a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 7h.01',
  wifi: 'M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  // o notebook
  trabalho: 'M5 5h14v10H5ZM3 19h18M5 15l-2 4M19 15l2 4',
  sofa: 'M6 10V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M4 10a2 2 0 0 1 2 2v1h12v-1a2 2 0 1 1 4 0v5H2v-5a2 2 0 0 1 2-2ZM5 17v2M19 17v2',
  // o ventilador de teto
  ventilador: 'M12 3v3.5M8.5 9.5a3.5 3 0 0 1 7 0ZM8.5 9.5l-6 1.5M15.5 9.5l6 1.5M10.5 9.5V11a1.5 1.5 0 0 0 3 0V9.5',
  // a máquina de lavar
  lavanderia: 'M5 3h14v18H5ZM5 7h14M8 14a4 4 0 1 0 8 0 4 4 0 1 0-8 0M8 5h.01M11 5h.01',
  // o carro de frente
  carro: 'M4 17v-5l2-5h12l2 5v5ZM4 12h16M7 14.5h1M16 14.5h1M6 17v2M18 17v2',
  // o escudo
  seguranca: 'M12 3l7 3v5c0 4.4-2.9 8.2-7 10-4.1-1.8-7-5.6-7-10V6l7-3ZM9 12l2 2 4-4',
  casa: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
  // os degraus
  escada: 'M3 20h4.5v-4.5H12V11h4.5V6.5H21V20Z',
  // a cama de perfil, com o travesseiro
  cama: 'M3 6v14M21 20v-5a3 3 0 0 0-3-3H3M3 16h18M6.5 12v-2a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v2',
};

/** Os ícones da interface da página da casa. */
export const DESENHOS_UI = {
  fotos: 'M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 13h7v7h-7Z',
  fechar: 'M6 6l12 12M18 6 6 18',
  esquerda: 'm15 6-6 6 6 6',
  direita: 'm9 6 6 6-6 6',
  abrir: 'm6 9 6 6 6-6',
} as const;

export function IconeCasa({ nome, className = 'size-6' }: { nome: NomeIcone | keyof typeof DESENHOS_UI; className?: string }) {
  const d = nome in DESENHOS_UI ? DESENHOS_UI[nome as keyof typeof DESENHOS_UI] : DESENHOS_CASA[nome as NomeIcone];
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
