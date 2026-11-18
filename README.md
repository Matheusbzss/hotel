# Orla Nativa — Viagens & Passeios

Site de passeios em Búzios, Cabo Frio e Arraial do Cabo, com reserva online, cartão e Pix pela Stripe no próprio site (ligados pela variável `PAGAMENTO_ONLINE`; sem ela o pedido segue pelo WhatsApp), voucher em PDF e área administrativa. Feito em Next.js 16, publicado na Vercel. Português (padrão), inglês, espanhol neutro (`/es`) e espanhol da Argentina (`/es-ar`).

## Onde mudar cada coisa

| O que                                                                                                            | Arquivo                                     |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Nome, e-mail, WhatsApp (só no fim da reserva), domínio                                                           | `src/config/empresa.ts`                     |
| Passeios (nome, cidade, categoria, preço de venda, opções, unidade, crianças, duração, inclusos, roteiro, fotos) | `src/data/passeios.ts`                      |
| Ajuste de todos os preços e desconto do Pix                                                                      | `src/config/precos.ts`                      |
| Regra padrão de crianças (até 5 anos grátis)                                                                     | `CRIANCAS_PADRAO` em `src/data/passeios.ts` |
| Pacotes Passeio + Hospedagem (sob consulta)                                                                      | `src/data/pacotes.ts`                       |
| Casas de temporada (desligada até as parcerias)                                                                  | `src/data/casas.ts`                         |
| Textos do site nos 3 idiomas (home, FAQ, checkout…)                                                              | `src/i18n/pt.ts`, `en.ts`, `es.ts`          |
| Política de Cancelamento, Termos de Uso, Política de Privacidade                                                 | `src/content/legal/`                        |
| Logos (horizontal, fundo escuro, emblema)                                                                        | `public/logo/`                              |

### Preço

Cada passeio guarda o **preço de venda** (`preco`): o que o cliente paga no cartão. Para subir ou baixar todos os preços de uma vez e para o desconto do Pix, altere `src/config/precos.ts`.

Unidades de preço: `'pessoa'`, `'veiculo'` ou `'embarcacao'` (com `capacidadePorUnidade`). Ex.: quadriciclo para até 2 pessoas, reserva de 3 pessoas = 2 quadriciclos.

`origemPreco` marca de onde veio o valor: `'parceiro'` (lista do parceiro) ou `'pesquisa'` (preço médio de mercado — confirme com o parceiro antes de vender).

**Opções**: passeios com mais de um formato usam `opcoes`, cada uma com o próprio `preco` (ex.: lancha 2 h ou 4 h, jet ski 30 min ou 1 h). O "a partir de" usa a mais barata.

**Crianças** (`criancas` em cada passeio):

| Regra                                  | Significa                                               |
| -------------------------------------- | ------------------------------------------------------- |
| `{ gratisAte: 5 }`                     | até 5 anos não paga; a partir de 6, inteira (padrão)    |
| `{ gratisAte: 5, meiaAte: 10 }`        | até 5 grátis; 6 a 10 meia (50%); 11+ inteira            |
| `{ gratisAte: null }`                  | todos pagam (lancha, quadriciclo, jet ski, helicóptero) |
| `{ gratisAte: null, idadeMinima: 10 }` | todos pagam, idade mínima 10 anos (mergulho)            |

Nos passeios por veículo/embarcação o preço não muda com a idade, mas todos contam na lotação.

### Fotos

Coloque as fotos em `public/fotos/` (hoje: `buzios/` e `arraial/`) e liste os caminhos no campo `fotos` do passeio:

```ts
fotos: ['/fotos/buzios/escuna-no-mar.jpg', '/fotos/buzios/escuna-proa.jpg'],
```

A primeira foto vira a capa, a galeria e a imagem de prévia no WhatsApp. O Next.js otimiza tudo (AVIF/WebP, tamanhos certos para o celular). Enquanto um passeio não tem fotos, o site mostra uma capa desenhada (sol, mar e o nome do passeio nas cores da cidade). Use fotos com pelo menos 1.200 px de largura.

## Casas de temporada

Área separada em `/casas-de-temporada`, **desligada** (`CASAS_ATIVO = false` em `src/data/casas.ts`): mostra "Em breve", um convite para proprietários, fica fora do menu, do sitemap e do Google. Para ativar, cadastre as casas na lista `CASAS` (há um exemplo comentado no arquivo) e mude `CASAS_ATIVO` para `true`. A consulta de datas é sempre por e-mail.

## Variáveis de ambiente

Veja `.env.example`. Resumo:

| Variável                               | Para quê                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                    | Chave restrita da Stripe (só servidor)                                    |
| `STRIPE_WEBHOOK_SECRET`                | Assinatura do webhook da Stripe (`whsec_…`)                               |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`   | Chave publicável (monta o checkout embutido)                              |
| `PAGAMENTO_ONLINE`                     | `desligado` (padrão), `admin` ou `publico`                                |
| `ADMIN_PASSWORD`                       | Senha do `/admin`                                                         |
| `SUPABASE_URL` e `SUPABASE_SECRET_KEY` | Banco de dados (só servidor)                                              |
| `CRON_SECRET`                          | Senha dos agendamentos da Vercel (e base dos links dos lembretes)         |
| `RESEND_API_KEY`                       | Chave do Resend para os e-mails automáticos (só servidor)                 |
| `EMAIL_REMETENTE`                      | Quem envia os e-mails (padrão `Orla Nativa <reservas@orlanativa.online>`) |
| `EMAIL_RESPOSTA`                       | Para onde vai a resposta do cliente (padrão, o e-mail da empresa)         |
| `NEXT_PUBLIC_META_PIXEL_ID`            | ID do Pixel da Meta                                                       |
| `BLOB_READ_WRITE_TOKEN`                | Blob Store com as reservas antigas (criada pela Vercel)                   |
| `NEXT_PUBLIC_SITE_URL`                 | Endereço oficial (sitemap, prévias, link do voucher)                      |

**Trocar o domínio**: adicione o domínio no projeto da Vercel e aponte o DNS; quando ele abrir, mude `NEXT_PUBLIC_SITE_URL` para o novo endereço e faça Redeploy. O domínio mostrado no voucher e nas políticas acompanha essa variável. Em 11/11/2026 o site passou para `orlanativa.online` e o domínio antigo (`agenciavictorhugo.online`) foi desligado, sem redirecionamento, por decisão do dono.

Sem as chaves da Stripe, ou com `PAGAMENTO_ONLINE` desligado, o checkout registra o pedido e ele segue pelo WhatsApp. Com as chaves de teste (`rk_test_…` e `pk_test_…`) e `PAGAMENTO_ONLINE=publico` no `.env.local`, o fluxo completo funciona em modo de teste; o passo a passo está em `docs/pagamentos-stripe.md`.

## Como funciona o pagamento

Cartão e Pix pela Stripe, no checkout embutido do próprio site. O desenho completo está em `docs/pagamentos-stripe.md`.

1. O cliente monta o carrinho; o total é recalculado no servidor (o navegador nunca define o preço).
2. No checkout ele escolhe **Pix** (com 10% de desconto) ou **cartão**; o servidor grava o pedido como `pendente` e abre a sessão de pagamento da Stripe.
3. O pagamento só é confirmado pelo webhook assinado da Stripe (`/api/webhooks/stripe`), que relê a sessão na Stripe antes de mudar o status. Pix vencido libera a vaga.
4. Pago → voucher com número único (ex.: `ON-7K3P9Q`), PDF e botão para enviar pelo WhatsApp. Reservas antigas com `VH-` continuam valendo.

Com `PAGAMENTO_ONLINE` desligado (o padrão), o pedido é registrado como `aguardando_whatsapp`: a equipe cobra pelo WhatsApp e marca como pago no painel.

## E-mails automáticos

Pelo Resend, nos quatro idiomas, só com `RESEND_API_KEY`: sem ela nada sai e o site segue normal. O desenho está em `docs/emails.md`.

- **Pedido recebido**, com o link privado do pedido (no caminho do WhatsApp e no pagamento online em aberto).
- **Pagamento aprovado** (cartão ou Pix pelo webhook, ou marcado como pago no painel), com um voucher por item e o PDF de cada um anexado.
- **Pix vencido** sem pagamento, com o link para pagar de novo.
- **Consultar meu pedido** (`/consultar-pedido`, link no rodapé): o e-mail da compra e o código do pedido; se baterem, o link vai por e-mail. A tela responde sempre a mesma coisa.
- **Carrinho abandonado**: quem digitou o e-mail no checkout e não terminou recebe até 2 lembretes (1 hora e 24 horas depois), pelo agendamento `/api/carrinho/lembretes` (a cada 15 minutos), com o link que devolve o carrinho e o de sair da lista. A página de estatísticas mostra quantos voltaram e compraram.

## Banco de reservas

Desde 03/11/2026 as reservas ficam no banco de dados (Supabase, projeto `orla-nativa`), com as migrações em `supabase/migrations/`. O Vercel Blob (privado) guarda só as reservas antigas, de antes do banco, que o site ainda consulta. No computador as reservas ficam em `.data/reservas/` (com `RESERVAS_NO_BANCO=1` no comando, no banco de verdade, para testar).

## Área administrativa

`/admin` (senha em `ADMIN_PASSWORD`): lista as reservas com status, voucher, data, hotel e contato; filtros, busca e total vendido; botões para marcar como pago (reservas finalizadas pelo WhatsApp), cancelar ou marcar reembolso.

## Rodar no computador

```bash
npm install
cp .env.example .env.local   # preencha o que tiver
npm run dev                  # http://localhost:3000
npm test                     # testes de preço, validação e voucher
npm run build                # build de produção
```

## Idiomas e endereços

- Português: `/`, `/passeios`, `/passeios/escuna-buzios`…
- Inglês: `/en/...` · Espanhol: `/es/...`

O seletor de bandeiras troca o idioma mantendo a mesma página. `sitemap.xml` e `robots.txt` são gerados automaticamente.
