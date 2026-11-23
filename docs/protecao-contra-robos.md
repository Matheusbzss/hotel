# Proteção contra robôs nos formulários (Pacote 20)

A Opção B que o dono escolheu em 23/11/2026 (o estudo completo está em `material-recebido/ANTES-DOS-ANUNCIOS-PROTECAO.md`):
a verificação invisível **BotID**, da Vercel, nos quatro envios que importam. Ela fica **desligada até o dono ligar**:
publicar este pacote não muda nada para quem visita o site. Os limites por endereço (IP) que já existiam estão em
[pagamentos-stripe.md](pagamentos-stripe.md), "Rede de segurança e limites por IP".

## Os quatro envios

| Envio | Rota | O que existia antes (e continua antes da verificação) |
|---|---|---|
| Fechar o pedido | `POST /api/pedido` | campo-isca, conferências do formulário, 20 pedidos a cada 10 min por IP, carrinho do próprio navegador, formas de pagamento |
| Pagar de novo um pedido em aberto | `POST /api/pedido/[codigo]/pagar` | 20 a cada 10 min por IP, o token do link privado, o status, as formas |
| Orçamento e mensagem | `POST /api/cotacoes` | campo-isca, conferências, 10 a cada 10 min por IP |
| Consultar meu pedido | `POST /api/consultar-pedido` | formato, campo-isca, 5 a cada 10 min por IP |

Em cada rota a ordem é: tudo o que já existia, **depois** a verificação (`barrarRobo`, `src/lib/robos-servidor.ts`),
**depois** o trabalho. Um envio que o limite já recusou nunca é verificado (com a análise profunda, cada verificação é
cobrada). O login do painel, o carrinho e a desistência ficam de fora.

- **Robô:** a rota responde `403 { ok: false, erro: 'robo' }`, não grava nada (nenhum pedido, nenhuma mudança no carrinho,
  nenhum e-mail, nenhuma sessão na Stripe) e escreve uma linha no registro, só com a rota: `[robos] POST /api/pedido:
  barrado como robô (403)`.
- **A verificação falhou** (erro da Vercel, ou mais de 3 segundos): o envio **passa** e fica uma linha no registro
  (`[robos] … a verificação falhou e o envio passou (…)`). Um problema da verificação nunca barra um cliente, como os
  limites por IP quando o banco falha.
- **"Consultar meu pedido"** continua respondendo o mesmo para dados certos e errados; a resposta do robô é a única nova.

## O interruptor

Uma variável pública, lida no **build**: `NEXT_PUBLIC_VERIFICACAO_ROBOS`.

| Valor | O que acontece |
|---|---|
| `desligada` (também quando falta ou vem qualquer outra coisa) | Nada. Nenhum script do BotID é carregado no navegador, nenhuma verificação é pedida, a linha nova da política de privacidade não aparece |
| `basica` | A verificação básica (grátis) nos quatro envios |
| `profunda` | A análise profunda (Deep Analysis, da Kasada, paga por verificação) nos quatro envios |

- Mudar o valor pede **uma publicação nova** (a variável entra no build, no navegador e no servidor).
- O nível vai igual no navegador e no servidor (`advancedOptions.checkLevel`: `basic` ou `deepAnalysis`). A documentação
  do BotID exige que os dois lados batam, senão a verificação falha.
- **Fora da produção da Vercel a verificação de verdade nunca roda**, diga o interruptor o que disser: a bancada, `next dev`,
  `next start` num computador e as prévias da Vercel. A conta usa `NEXT_PUBLIC_VERCEL_ENV`, que a Vercel põe sozinha no
  build, nos dois lados (`verificacaoNoAr`, `src/lib/robos.ts`). Se um dia essa variável faltar no build, os dois lados
  ficam desligados juntos: nenhum cliente é barrado por isso.
- Com o interruptor ligado, a política de privacidade ganha uma linha na lista de quem trata os dados, logo depois de
  "Vercel e Supabase" (`privacidadeComRobos`, `src/content/legal/online.ts`): "Vercel (com a Kasada, parceira dela):
  verificação automática contra robôs nos formulários e no pagamento. Ela analisa sinais técnicos do aparelho e do
  navegador para detectar robôs e melhorar essa proteção." A data da política **não** muda neste pacote: ela muda no dia de
  ligar o interruptor (troque a data da versão que estiver valendo, em `src/content/legal/tipos.ts` ou
  `src/content/legal/online.ts`).

## A mensagem para quem for confundido com robô

Nos quatro formulários, no mesmo lugar onde eles já mostram o erro do envio (`comum.robo` no dicionário):

- pt: "Não deu para concluir pelo site agora. Fale com a gente pelo WhatsApp, que a gente termina por lá."
- en: "We couldn't finish this on the site right now. Talk to us on WhatsApp and we'll finish it there."
- es: "No pudimos terminar por el sitio ahora. Escríbenos por WhatsApp y lo terminamos por ahí."
- es-ar: "No pudimos terminar por el sitio ahora. Escribinos por WhatsApp y lo terminamos por ahí."

O dono aprova os textos pelos prints antes de qualquer coisa ir ao ar. **Nenhum dos quatro formulários tem hoje um botão
de link do WhatsApp** (o "Finalizar pelo WhatsApp" do checkout é o botão que envia o pedido, não um link; e a regra do site
mostra o WhatsApp da equipe só depois do pagamento): por isso a mensagem aparece sem botão. Pôr um botão do WhatsApp nessa
mensagem é decisão do dono.

## Como ligar (o que o dono faz no painel da Vercel)

Nada disso é feito por código nem por agente: nenhuma regra do firewall e nenhum segredo são criados por aqui. Os passos
são os da parte 7 de `material-recebido/ANTES-DOS-ANUNCIOS-PROTECAO.md` (vercel.com, equipe **russo team**, projeto
**agencia-victor-hugo**, **Firewall**; o botão **Publish** do Firewall só confirma a mudança no Firewall, não publica o
site):

1. **Bot Protection em Log** (só anota, não barra): Firewall → **Rules** → **Bot Management** → **Bot Protection** →
   **Log** → **Review Changes** → **Publish**.
2. **A regra de limite por minuto** ("Limite dos formulários"): Firewall → **⋯** → **Configure** → **Add New...** →
   **Rule**; o texto da parte 7, passo 3 b (POST nos 5 caminhos, 20 por 60 segundos por IP, resposta 429); se abrir
   **Rate Limiting Pricing**, **Continue**; **Save Rule** → **Review Changes** → **Publish**.
3. **Ligar o interruptor**: na Vercel, em Settings → Environment Variables, `NEXT_PUBLIC_VERIFICACAO_ROBOS` = `basica`
   (só em Production) e publicar o site de novo, com o "Pode publicar" do dono.
4. **No dia dos anúncios ou do cartão (o que vier primeiro):** Firewall → **Rules** → ligar **Vercel BotID Deep Analysis**
   → **Review Changes** → **Publish**; e trocar o interruptor para `profunda` e publicar de novo.
5. **Emergência (o custo subiu):** voltar o interruptor para `basica` (ou `desligada`) e publicar de novo; desligar a Deep
   Analysis no painel.

## Custo

- Básica: grátis.
- Análise profunda: US$ 1 a cada 1.000 verificações (uns R$ 5,65), só quando o site pede a verificação (quem só olha as
  páginas não conta). Estimativa do estudo de 14/11 para o começo: de R$ 3 a R$ 17 por mês (500 a 3.000 envios). Num
  ataque de robô que troca de endereço, a conta sobe: 10 mil tentativas, uns R$ 57. Não está escrito pela Vercel se sai do
  crédito de US$ 20 do Pro.
- A regra de limite por minuto: US$ 0,80 por milhão de envios que ela deixa passar (São Paulo); centavos por mês.
- Os preços são os conferidos em 14/11/2026 no estudo do dono; a busca na documentação da Vercel feita neste pacote (23/11)
  não trouxe a página de preços, então não foram conferidos de novo.

## A bancada (ver a mensagem sem a Vercel)

O BotID não roda fora da Vercel. Para a bancada **ver a mensagem**, existe a opção da própria biblioteca que imita um robô
ruim (`developmentOptions.bypass: 'BAD-BOT'`), atrás da variável `ROBOS_DE_MENTIRA`, que só é lida fora da produção da
Vercel (duas travas: `NEXT_PUBLIC_VERCEL_ENV` e `VERCEL_ENV`). Com ela, **todo** envio dos quatro formulários volta 403
`robo`, com ou sem o interruptor, e nada é gravado. É uma variável do servidor, lida na hora: não precisa de build novo.

- Ligar na bancada (Git Bash, na pasta do site, depois do build de sempre): `ROBOS_DE_MENTIRA=robo npm run start -- -p 3400`
  (ou a porta de sempre da bancada). No PowerShell: `$env:ROBOS_DE_MENTIRA='robo'; npm run start -- -p 3400`.
- Desligar: parar o servidor e subir de novo sem a variável.
- Para ver também a linha nova da política de privacidade, o build precisa do interruptor: `NEXT_PUBLIC_VERIFICACAO_ROBOS=basica
  npm run build` e depois o `npm run start` (na bancada a verificação de verdade continua sem rodar).
- Com `next dev` a mensagem também aparece com `ROBOS_DE_MENTIRA=robo` (no `next dev` o BotID do navegador não faz nada,
  como diz a documentação dele).
- O `ROBOS_DE_MENTIRA` só funciona se o `.env.local` da bancada não trouxer `VERCEL_ENV=production` nem
  `NEXT_PUBLIC_VERCEL_ENV=production` (por exemplo, vindos de um `vercel env pull` da produção): com eles, as duas travas
  tratam a bancada como o site no ar e a variável é ignorada.

## O que não deu para provar sem a Vercel

- Que a verificação de verdade responde "pessoa" para os clientes de verdade (e com que frequência confunde alguém: a
  Vercel não diz) e "robô" para um envio feito por programa. Só no ar, no dia de ligar: um pedido de teste pela página,
  um envio direto por programa (deve voltar 403 `robo`) e o painel Firewall mostrando as verificações.
- Que o script do desafio (servido pelo nosso endereço pelo `withBotId`) carrega e que o navegador anexa a resposta aos
  quatro envios. A política de segurança do navegador está em modo de aviso: se o script da Kasada pedir alguma origem ou
  permissão que ela não tem, o aviso aparece em `/api/csp` sem bloquear nada. A documentação do BotID não pede nada na
  política, e os caminhos dele são do próprio site (`'self'`).
- Que as chamadas do BotID sob `/149e9513-…/` chegam à Vercel. Esse prefixo fica fora do proxy de idioma
  (`src/proxy.ts`), senão elas virariam `/pt/149e…` e dariam 404. No dia de ligar, conferir na aba Rede do navegador que
  as chamadas sob `/149e9513-…/` respondem 200, e não 404.
- Se o nível escolhido por envio (`checkLevel`) se sobrepõe ao botão Deep Analysis do painel nos dois sentidos (por
  exemplo, se `basica` continua grátis com o botão ligado, ou se `profunda` funciona com o botão desligado). A busca na
  documentação trouxe só que os dois lados precisam pedir o mesmo nível; por isso o passo 4 liga os dois juntos.
- Que a verificação tem o token de identificação da Vercel (OIDC) de que precisa: se faltar, ela falha, e pela regra o
  envio passa. Conferir no registro, no dia de ligar, que não aparece a linha "a verificação falhou".
- O custo real (depende de quantos envios os anúncios trouxerem) e se a análise profunda sai do crédito do Pro.
- Os nossos testes por programa no ar (o pedido "TESTE CLAUDE" feito por script) vão ser barrados com o interruptor
  ligado: o passe livre do estudo do dono é uma regra do firewall e um segredo, que não são criados por código.
