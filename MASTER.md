# MASTER: design system da Orla Nativa

Fonte única dos valores: [`design-dna.json`](design-dna.json). Este arquivo é a leitura humana dele. Os tokens do código (`src/app/tokens.css`) são gerados a partir do JSON com `npm run tokens` (também antes do build); nunca edite cores, fontes ou medidas à mão em outro lugar.

## Teses validadas

Primeira versão em 2026-10-31 (Boletim do mar). Ajustada pelo dono em 2026-11-01, depois de ver a página: o mar desenhado em 3D ficou artificial e a tabela ficou com cara de escritório.

**Visual.** A orla de verdade, organizada: fotos reais levam o desejo (o pôr do sol com barcos na baía de Búzios ocupa o topo; cada passeio é um cartão com a própria foto) e a decisão vem clara por cima delas, com o preço por pessoa em número grande, a duração numa etiqueta com a cor do dado e o total do grupo pequeno. A interface flutua sobre as fotos em vidro fosco estilo iPhone (menu, barra de reserva, etiquetas). Nas partes de leitura, chão branco frio #F4F8F8 e tinta mar-fundo #063643; a ação é o dourado #F2AD47 com texto escuro. Barlow em três larguras. Cartões com raio de 8 px, campos de 4 px, vidro de 16 px. Mais ar, menos tabela.

**Interação.** Rápido e preciso: toque em 120 ms, estado e números em 200 ms, entrada em 360 ms, tudo em cubic-bezier(0.2, 0, 0, 1). A foto do topo se move de leve com a inclinação do celular, o mouse e a rolagem. Os cartões inclinam até 6 graus seguindo o dedo ou o mouse e sobem um pouco; no celular deslizam para o lado com encaixe. O mapa 3D tem relevo real: arrastar inclina, tocar numa cidade aproxima a câmera, mostra as praias e a foto da cidade. Proibido: elástico, parallax em todas as seções, animação no checkout além da barra de progresso e do sucesso, urgência e contadores falsos. Com "reduzir movimento", nada se move e o mapa fica plano.

**Padrões permitidos:** vidro fosco estilo iPhone (pedido do dono) no menu, na barra de reserva e nas etiquetas sobre fotos; foto em tela cheia no topo com movimento suave; inclinação 3D dos cartões; cor da duração como etiqueta; números grandes tabulares; barra de reserva fixa no celular.

## Marca

Logo A, Horizonte: célula com céu dourado, meio sol no horizonte e mar fundo com duas linhas de água; nome em Barlow Semi Condensed 600. Componente: `src/components/Logo.tsx`.

## Cor

| Papel | Token | Valor | Uso |
|---|---|---|---|
| Tinta / mar fundo | `--color-tinta`, `--color-mar` | #063643 | todo texto; partes escuras |
| Chão | `--color-fundo` | #F4F8F8 | fundo das partes de leitura |
| Papel | `--color-papel` | #FFFFFF | cartões, campos |
| Superfície | `--color-superficie` | #E6EEEF | apoio, esqueletos, desativado |
| Borda | `--color-borda` / `--color-borda-campo` | #C3D2D4 / #6F8790 | decorativa / limite de controles |
| Texto suave | `--color-tinta-suave` | #4A6470 | texto secundário |
| Ação (sol) | `--color-acao` | #F2AD47 | botão principal, texto #063643 |
| Turquesa | `--color-turquesa` / `--color-turquesa-texto` | #04A7AA / #0A6F72 | água e destaque / links |
| Duração | `--color-d1` … `--color-d5` | #8FD3D4 … #F29B5C | etiqueta: até 1 h · 2–3 h · 4–5 h · 6–8 h · dia inteiro |
| Vidro | `--vidro-foto`, `--vidro-claro`, `--vidro-escuro` | branco 16% / branco 72% / mar 72% | com `--vidro-desfoque` (18 px, saturação 160%) |

## Tipografia

Barlow (texto), Barlow Semi Condensed (títulos, preços, etiquetas), Barlow Condensed (gancho). Preços e horas com `tabular-nums`.

## Fotos

Fotos reais dos passeios em `public/fotos/`. Fotos de terceiros só com licença comercial, registradas em `public/fotos/CREDITOS.md`.

## Movimento e 3D

`--ease-padrao`, 120 / 200 / 360 ms. 3D só no mapa: relevo real (Terrain Tiles da AWS) com litoral do OpenStreetMap, carregado quando a seção se aproxima; sem 3D, o mapa plano com o mesmo relevo.
