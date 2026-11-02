# Orla Nativa — Viagens & Passeios

Site de passeios em Búzios, Cabo Frio e Arraial do Cabo, com reserva online, pagamento por Pix ou cartão (Pagar.me API v5), voucher em PDF e área administrativa. Feito em Next.js 16, publicado na Vercel. Português (padrão), inglês e espanhol.

## Onde mudar cada coisa

| O que                                                                                                               | Arquivo                                       |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Nome, CNPJ, e-mail, WhatsApp (só no fim da reserva), domínio                                                        | `src/config/empresa.ts`                       |
| Passeios (nome, cidade, categoria, preço do parceiro, opções, unidade, crianças, duração, inclusos, roteiro, fotos) | `src/data/passeios.ts`                        |
| Margem sobre o preço do parceiro (hoje 10%)                                                                         | `MARGEM_PERCENTUAL` em `src/data/passeios.ts` |
| Regra padrão de crianças (até 5 anos grátis)                                                                        | `CRIANCAS_PADRAO` em `src/data/passeios.ts`   |
| Pacotes Passeio + Hospedagem (sob consulta)                                                                         | `src/data/pacotes.ts`                         |
| Casas de temporada (desligada até as parcerias)                                                                     | `src/data/casas.ts`                           |
| Textos do site nos 3 idiomas (home, FAQ, checkout…)                                                                 | `src/i18n/pt.ts`, `en.ts`, `es.ts`            |
| Política de Cancelamento, Termos de Uso, Política de Privacidade                                                    | `src/content/legal/`                          |
| Logos (horizontal, fundo escuro, emblema)                                                                           | `public/logo/`                                |

### Preço

O site guarda o **preço do parceiro** (`precoParceiro`) e calcula o preço de venda somando a margem:
R$ 100 → R$ 110,00 · R$ 265 → R$ 291,50. Para mudar a margem de todos os passeios, altere só `MARGEM_PERCENTUAL`.

Unidades de preço: `'pessoa'`, `'veiculo'` ou `'embarcacao'` (com `capacidadePorUnidade`). Ex.: quadriciclo para até 2 pessoas, reserva de 3 pessoas = 2 quadriciclos.

`origemPreco` marca de onde veio o valor: `'parceiro'` (lista do parceiro) ou `'pesquisa'` (preço médio de mercado — confirme com o parceiro antes de vender).

**Opções**: passeios com mais de um formato usam `opcoes`, cada uma com o próprio `precoParceiro` (ex.: lancha 2 h ou 4 h, jet ski 30 min ou 1 h). O "a partir de" usa a mais barata.

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

| Variável                         | Para quê                                                        |
| -------------------------------- | --------------------------------------------------------------- |
| `PAGARME_SECRET_KEY`             | Chave secreta da Pagar.me (só servidor)                         |
| `NEXT_PUBLIC_PAGARME_PUBLIC_KEY` | Chave pública (tokeniza o cartão no navegador)                  |
| `PAGARME_WEBHOOK_TOKEN`          | Senha que protege o webhook                                     |
| `ADMIN_PASSWORD`                 | Senha do `/admin`                                               |
| `NEXT_PUBLIC_META_PIXEL_ID`      | ID do Pixel da Meta                                             |
| `BLOB_READ_WRITE_TOKEN`          | Criada pela Vercel ao conectar o Blob Store (banco de reservas) |
| `NEXT_PUBLIC_SITE_URL`           | Endereço oficial (sitemap, prévias, link do voucher)            |

**Trocar o domínio** (ex.: para `orlanativa.com.br`): adicione o domínio no projeto da Vercel e aponte o DNS; quando ele abrir, mude `NEXT_PUBLIC_SITE_URL` para o novo endereço e faça Redeploy. O domínio mostrado no voucher e nas políticas acompanha essa variável; depois, redirecione o domínio antigo para o novo.

Sem as chaves da Pagar.me, o checkout funciona até a etapa de pagamento e registra a reserva para finalizar pelo WhatsApp. Com chaves de teste (`sk_test_…`/`pk_test_…`), o fluxo completo funciona em modo de teste.

## Como funciona o pagamento

1. O cliente escolhe data e pessoas; o total é recalculado no servidor (o navegador nunca define o preço).
2. **Pix**: o servidor cria o pedido na Pagar.me e mostra QR Code + copia e cola. A página consulta o status a cada 4 s e o webhook confirma o pagamento.
3. **Cartão**: o número é tokenizado no navegador com a chave pública (`/core/v5/tokens`), e só o token vai para o servidor.
4. Pago → voucher com número único (ex.: `ON-7K3P9Q`), PDF e botão para enviar pelo WhatsApp. Reservas antigas com `VH-` continuam valendo.

O webhook nunca confia no corpo do evento: ele consulta o pedido na API da Pagar.me antes de mudar o status.

## Banco de reservas

Vercel Blob em modo **privado**: cada reserva é um JSON em `reservas/<VOUCHER>.json`. O código do voucher é gravado com "não sobrescrever", então nunca se repete. No computador, sem a variável do Blob, as reservas ficam em `.data/reservas/`.

## Área administrativa

`/admin` (senha em `ADMIN_PASSWORD`): lista as reservas com status, voucher, data, hotel e contato; filtros, busca, total vendido e margem; botões para marcar como pago (reservas finalizadas pelo WhatsApp), cancelar ou marcar reembolso.

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
