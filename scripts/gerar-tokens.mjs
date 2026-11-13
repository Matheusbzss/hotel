/**
 * Gera src/app/tokens.css a partir de design-dna.json, a fonte única do design system.
 * Uso: npm run tokens (roda também antes do build). Nunca edite tokens.css à mão.
 */
import { readFile, writeFile } from 'node:fs/promises';

const dna = JSON.parse(await readFile(new URL('../design-dna.json', import.meta.url), 'utf8'));
const S = dna.design_system;
const C = S.color;
const T = S.typography.type_scale;
const M = S.motion;
const [papel, fundo, superficie, borda, bordaCampo, tintaSuave, tinta] = C.neutral.scale;

const cores = {
  fundo,
  papel,
  superficie,
  borda,
  'borda-campo': bordaCampo,
  tinta,
  'tinta-suave': tintaSuave,
  mar: C.primary.hex,
  acao: C.accent.hex,
  sol: C.accent.hex,
  turquesa: C.secondary.hex,
  'turquesa-texto': C.secondary_text.hex,
  sucesso: C.semantic.success,
  aviso: C.semantic.warning,
  erro: C.semantic.error,
  'erro-claro': C.semantic.error_surface,
  whats: C.sky_and_sea.whatsapp_after_purchase_only,
  brilho: papel,
  'ceu-alto': C.sky_and_sea.sky_top,
  'ceu-meio': C.sky_and_sea.sky_mid,
  'ceu-brilho': C.sky_and_sea.sky_glow,
  'mar-longe': C.sky_and_sea.sea_far,
  terra: C.sky_and_sea.land,
  ...Object.fromEntries(C.data_scale.steps.map((s) => [s.id, s.hex])),
};

const texto = {
  small: T.body_small,
  caption: T.caption,
  body: T.body,
  lead: T.heading_3,
  head: T.heading_1,
  h2: T.heading_2,
  display: T.display,
  overline: T.overline,
  figure: T.figure,
  'figure-lg': T.figure_large,
};

const linhas = [
  '/* Gerado por scripts/gerar-tokens.mjs a partir de design-dna.json. Não edite à mão. */',
  '@theme {',
  ...Object.entries(cores).map(([k, v]) => `  --color-${k}: ${v};`),
  '',
  '  --font-sans: var(--font-barlow), "Arial Nova", "Segoe UI", Roboto, system-ui, sans-serif;',
  '  --font-semi: var(--font-barlow-semi), var(--font-barlow), "Arial Nova", system-ui, sans-serif;',
  '  --font-display: var(--font-barlow-cond), var(--font-barlow-semi), "Arial Nova", system-ui, sans-serif;',
  '',
  ...Object.entries(texto).flatMap(([k, t]) => [`  --text-${k}: ${t.size};`, `  --text-${k}--line-height: ${t.line_height};`]),
  '',
  `  --ease-padrao: ${M.easing.standard};`,
  `  --ease-saida: ${M.easing.exit};`,
  '  --radius-celula: 4px;',
  '  --radius-folha: 8px;',
  '  --radius-cartao: 8px;',
  '  --radius-vidro: 16px;',
  '}',
  '',
  ':root {',
  `  --vidro-foto: ${C.glass.sobre_foto.fundo};`,
  `  --vidro-foto-borda: ${C.glass.sobre_foto.borda};`,
  `  --vidro-claro: ${C.glass.sobre_claro.fundo};`,
  `  --vidro-claro-borda: ${C.glass.sobre_claro.borda};`,
  `  --vidro-escuro: ${C.glass.escuro.fundo};`,
  `  --vidro-escuro-borda: ${C.glass.escuro.borda};`,
  `  --vidro-desfoque: blur(${C.glass.desfoque}) saturate(${C.glass.saturacao});`,
  `  --dur-toque: ${M.duration_scale.micro};`,
  `  --dur-estado: ${M.duration_scale.normal};`,
  `  --dur-entrada: ${M.duration_scale.macro};`,
  '  --stagger: 40ms;',
  '  --vao-celula: 3px;',
  `  --margem: ${S.layout.margin};`,
  `  --largura-max: ${S.layout.max_content_width};`,
  '}',
  '',
];

await writeFile(new URL('../src/app/tokens.css', import.meta.url), linhas.join('\n'));
console.log('tokens.css gerado a partir de design-dna.json');
