# MASTER: design system da Orla Nativa

Fonte única dos valores: [`design-dna.json`](design-dna.json). Este arquivo é a leitura humana dele. Os tokens do código (`src/app/tokens.css`) são gerados a partir do JSON com `npm run tokens`; nunca edite cores, fontes ou medidas à mão em outro lugar.

## Teses validadas (2026-10-31)

**Visual.** Boletim do mar: as partes de sonho são o mar 3D realista ao entardecer, em mar fundo #063643, e as partes de decisão são um boletim em branco frio #F4F8F8, onde cada passeio é uma linha de células e a cor é dado (do turquesa de Arraial ao dourado do pôr do sol, conforme quanto do dia o passeio ocupa); o botão de ação é dourado #F2AD47 com texto mar-fundo; tipografia grotesca precisa, com números tabulares grandes como protagonistas e cabeçalhos de coluna curtos em caixa alta; compacto nas tabelas e arejado entre os blocos, uma pausa calma depois de cada bloco denso, base de 8 px; células com cantos de 4 px e bordas de 1 px, o escolhido em traço cheio e as alternativas tracejadas, sem sombra decorativa: profundidade só no 3D. Fonte: Barlow (decidida no design system), em três larguras.

**Interação.** Rápido e preciso: o toque responde em 120 ms (escala 0,97); mudar data ou grupo recalcula todos os totais com números rolando em 200 ms, escalonados de 40 em 40 ms (no máximo 400 ms); blocos entram em 360 ms; tudo em cubic-bezier(0.2, 0, 0, 1). O mar 3D se move sem parar, devagar, e responde ao toque, à inclinação do celular e à rolagem: a câmera sobe do mar até o mapa 3D da região, acompanhando a rolagem com 0,6 s de atraso. Tocar num passeio o traz para a frente e o deixa parado; os outros recuam. A barra de reserva fica fixa embaixo no celular. Proibido: bounce ou elástico, parallax em todas as seções, animação no checkout além da barra de progresso e do sucesso, urgência e contadores falsos. Com "reduzir movimento", o mar vira uma imagem parada e tudo muda sem animação.

**Padrões permitidos:** o mar 3D em movimento contínuo; a escala de cor como dado de duração; números grandes tabulares; alternativas tracejadas; cabeçalhos de coluna curtos em caixa alta; barra de reserva fixa no celular.

**Mostradores:** ousadia 5, movimento 8, densidade 6.

## Marca

Logo A, Horizonte: célula com céu dourado, meio sol no horizonte e mar fundo com duas linhas de água; nome em Barlow Semi Condensed 600. Componente: `src/components/Logo.tsx`.

## Cor

| Papel | Token | Valor | Uso |
|---|---|---|---|
| Tinta / mar fundo | `--color-tinta`, `--color-mar` | #063643 | todo texto; partes imersivas; barra fixa |
| Chão | `--color-fundo` | #F4F8F8 | fundo das partes de decisão |
| Papel | `--color-papel` | #FFFFFF | células, campos |
| Superfície | `--color-superficie` | #E6EEEF | apoio, esqueletos, desativado |
| Borda de célula | `--color-borda` | #C3D2D4 | decorativa |
| Borda de campo | `--color-borda-campo` | #6F8790 | limite de controles (3,54:1) |
| Texto suave | `--color-tinta-suave` | #4A6470 | texto secundário (5,86:1) |
| Ação (sol) | `--color-acao`, `--color-sol` | #F2AD47 | botão principal, texto #063643 (6,71:1) |
| Turquesa | `--color-turquesa` | #04A7AA | água, destaque; nunca texto sobre claro |
| Turquesa texto | `--color-turquesa-texto` | #0A6F72 | links (5,95:1) |
| Sucesso / aviso / erro | `--color-sucesso`, `--color-aviso`, `--color-erro` | #1E7A4C / #9A5B00 / #B3261E | estados |
| Duração | `--color-d1` … `--color-d5` | #8FD3D4 #B9DFD3 #E4D9B8 #F5C66E #F29B5C | até 1 h · 2–3 h · 4–5 h · 6–8 h · dia inteiro |

## Tipografia

Barlow (texto), Barlow Semi Condensed (títulos, cabeçalhos de coluna, números), Barlow Condensed (gancho). Preços, horas e totais sempre com `tabular-nums` (conferido: a Barlow tem algarismos tabulares reais). Escala fluida em `design-dna.json > typography.type_scale`.

## Espaço, grade e forma

Base 8 px (meio passo 4). Células com 3 px de chão entre elas, sem fio em cada linha. Grade de 4/8/12 colunas. Tabela do boletim em degraus: celular (passeio, horas, total), tablet (+ cidade, para quem), computador (+ crianças, inclui). O preço nunca encolhe. Raio 4 px em tudo; 8 px só no topo de folhas. Nenhuma sombra.

## Componentes (cinco estados)

Normal, passar o mouse (borda vira tinta), foco (anel 2 px tinta, 2 px de folga; sobre o mar o anel é dourado), pressionado (escala 0,97), desativado (superfície #E6EEEF, texto #6F8790). Botão principal dourado; secundário com contorno; links sublinhados em turquesa texto. Linha do boletim: célula do nome, célula de horas com a cor de duração, célula do total; escolhida em traço cheio de 2 px e escala 1,02; alternativas tracejadas, 0,6 de opacidade e escala 0,98.

## Movimento

`--ease-padrao: cubic-bezier(0.2, 0, 0, 1)`; toque 120 ms, estado 200 ms, entrada 360 ms, escalonado 40 ms (máx. 400 ms), câmera 3D com scrub de 0,6 s. Entrada: sobe 12 px e aparece, uma vez. Checkout: só barra de progresso e sucesso. Reduzir movimento: mar parado (imagem), mudanças sem animação.

## 3D

Uma cena three.js só, num canvas fixo atrás das seções transparentes (herói e mapa): mar com ondas de Gerstner e céu de entardecer; a câmera sobe do nível do mar à vista aérea da Região dos Lagos com a rolagem. Carrega depois do texto e dos botões; pausa fora da tela; sem WebGL, com reduzir movimento ou economia de dados, fica a imagem parada do mesmo céu. Litoral a partir de dados do OpenStreetMap (© colaboradores do OpenStreetMap).
