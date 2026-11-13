# E-mails automáticos, "Consultar meu pedido" e carrinho abandonado (Etapa 6)

Escrito em 13/11/2026 a partir do FASE-4.md (Etapa 6) e das decisões tomadas com o dono fora (sempre a opção recomendada). É o desenho que o código segue; quando o código mudar, este arquivo muda junto.

## Tudo desligado até existir a chave

Sem `RESEND_API_KEY`, **nenhum e-mail sai**: o registro do servidor guarda só o tipo do e-mail e o código do pedido (nunca nome, e-mail, assunto ou telefone) e o site segue normal. O agendamento dos lembretes responde sem ler o banco, a página "Consultar meu pedido" mostra o caminho por e-mail para a equipe e a página de estatísticas mostra "○ Desligado" no cartão "E-mails automáticos".

## Variáveis (só no `.env.local` e na Vercel, nunca no código)

| Nome              | Onde                 | Para quê                                                                                                                                                     |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RESEND_API_KEY`  | servidor (Sensitive) | chave do Resend com permissão **Sending access** e presa ao domínio do remetente (`orlanativa.online`): ela só envia, e só por esse domínio                  |
| `EMAIL_REMETENTE` | servidor             | opcional; padrão `Orla Nativa <reservas@orlanativa.online>`                                                                                                  |
| `EMAIL_RESPOSTA`  | servidor             | opcional; para onde vai a resposta do cliente; padrão `financeiro@orlanativa.com` (`src/config/empresa.ts`, Google Workspace)                                |
| `CRON_SECRET`     | servidor (já existe) | a senha dos agendamentos; também é a base (derivada com HMAC) da chave que assina os links dos lembretes. Trocar invalida os links dos e-mails que já saíram |

`/api/saude` informa `email: 'ligado' | 'desligado'`, sem mostrar a chave.

## O envio

- **Resend pela API REST** (`POST https://api.resend.com/emails`, `Authorization: Bearer`, com `User-Agent`), sem pacote novo: `src/lib/email/enviar.ts`. HTML e texto puro em todo e-mail, `reply_to` = `EMAIL_RESPOSTA`, etiqueta `tipo` (aparece no painel do Resend).
- **Sem e-mail repetido**: o cabeçalho `Idempotency-Key` (válido por 24 horas no Resend) e uma linha no histórico do pedido ("E-mail ao cliente: …"), conferida antes de enviar. A resposta 409 do Resend (a mesma chave já usada) conta como enviado.
- **Depois da resposta**: os e-mails dos pedidos saem por `after` (`next/server`), em `src/lib/email/depois.ts`. O webhook da Stripe responde na hora; uma falha no e-mail nunca desfaz um pagamento.
- **Falhas**: rede e Resend fora do ar tentam mais uma vez. O e-mail do pagamento aprovado que não sai deixa no histórico um "Aviso:" (o painel destaca) para a equipe mandar o link do pedido por outro caminho.
- **Plano grátis do Resend** (nov/2026): 100 e-mails por dia (o dia vira à meia-noite UTC), 3.000 por mês, 10 chamadas por segundo. Acima da cota o Resend recusa (429) e não guarda para depois. Por isso os lembretes do carrinho param em 30 por dia (`LEMBRETES_POR_DIA`): o resto da cota fica para os e-mails dos pedidos.

## Os e-mails (nos quatro idiomas: pt, en, es neutro com "tú", es-ar com "vos")

Textos em `src/lib/email/textos.ts` (fora dos dicionários do site), montagem em `src/lib/email/mensagens.ts` e moldura em `src/lib/email/modelo.ts`: tabelas, estilo embutido, as cores e as medidas do site (MASTER.md), botão largo para o polegar, "e-mail" sem quebrar no hífen. A única imagem é o emblema no topo, com o nome no texto alternativo; com as imagens bloqueadas, o e-mail continua inteiro. Nenhum e-mail traz razão social, o número da empresa nem endereço (`tests/email.test.ts` confere).

1. **Pedido recebido** (`pedido-recebido`): quando o pedido nasce (`POST /api/pedido`). Duas versões: o caminho do WhatsApp (manda abrir o pedido, onde está o botão; o número não vai no e-mail) e o pagamento online em aberto (cartão ou Pix pela Stripe: "quando o pagamento for confirmado, chega outro e-mail"). Não sai se, na hora do envio, o pedido já está pago ou cancelado.
2. **Pagamento aprovado** (`pagamento-aprovado`): quando o pedido vira pago — `pedidoPago` (webhook ou consulta à Stripe, cartão ou Pix) e "marcar como pago" no painel (pedidos do WhatsApp). Um voucher por item, cada um com "Ver o voucher" e "Baixar o PDF", o PDF de cada voucher anexado (até 5 MB somados; acima disso, só os links), o total pago com a forma, o link do pedido e o botão do WhatsApp da equipe (`mostrarWhatsApp`: só pago).
3. **Pix vencido** (`pix-vencido`): quando o pedido de Pix vira expirado (`checkout.session.expired` e `async_payment_failed`, no webhook ou na consulta), um por sessão vencida: nada foi cobrado, e o link do pedido leva ao "pagar de novo". O cartão que vence sem pagamento não manda nada (o cliente já tem o link no e-mail do pedido recebido).
4. **Link do pedido** (`link-do-pedido`): pedido na página "Consultar meu pedido".
5. **Lembretes do carrinho** (`lembrete-1`, `lembrete-2`): abaixo.

O link privado de cada e-mail é o da página do pedido (vários itens) ou o da reserva (um item), com o token, no idioma do e-mail.

## "Consultar meu pedido"

`/consultar-pedido` (`/en/find-my-order`, `/es/consultar-pedido` e `/es-ar/consultar-pedido`), fora do Google, com um link discreto no rodapé. O cliente digita o e-mail da compra e o código (aceita `on-7k3p9q`, `ON 7K3P9Q`, só `7K3P9Q`, o código de um voucher do pedido e o prefixo antigo `VH-`). `POST /api/consultar-pedido` responde **sempre** `{ ok: true }` quando os dados vêm no formato certo; a busca e o envio acontecem depois da resposta, então nem o tempo de resposta diz se o pedido existe. Se o e-mail digitado for o do pedido, o link vai para ele. Limites: 5 consultas por IP a cada 10 minutos; 3 e-mails com o link do mesmo pedido por hora. Sem a chave do Resend, a página manda escrever para a equipe. Regras em `src/lib/consulta-pedido.ts`, textos em `src/lib/consulta-textos.ts`.

## Carrinho abandonado

- **Quem recebe**: quem digitou o e-mail no checkout (`PATCH /api/carrinho`) e não terminou. O carrinho que virou pedido não recebe (o cliente já tem os e-mails do pedido).
- **Quando** (`src/lib/lembretes.ts`): o primeiro a partir de **1 hora** sem mexer no carrinho; o segundo a partir de **24 horas**, e pelo menos 12 horas depois do primeiro. No máximo dois. Nenhum se: a pessoa saiu da lista, a data de algum item já passou, falta menos de 2 horas para o primeiro serviço (o mesmo prazo mínimo de reserva), algum item não vale mais no site, ou o carrinho está parado há mais de 3 dias.
- **Agendamento**: `/api/carrinho/lembretes`, a cada 15 minutos (`vercel.json`; o plano Pro da Vercel aceita até 100 agendamentos por projeto, de minuto em minuto), com `Authorization: Bearer CRON_SECRET`. O lembrete é reservado no banco antes de sair (de duas rodadas juntas, só uma envia) e volta para a fila se a cota ou o Resend falharem.
- **Voltar ao carrinho**: `/api/carrinho/voltar?t=…`, um link assinado (HMAC) com o id do carrinho, que vale 30 dias. Ele devolve o carrinho como estava (o cookie `on_carrinho`) e leva ao checkout no idioma do e-mail. A primeira volta fica guardada para as estatísticas. Nunca vai no link o e-mail nem o código do cookie.
- **Sair da lista** em um clique: o link do fim do e-mail (`/api/email/sair?t=…`, também assinado, não vence) e o "cancelar inscrição" do próprio aplicativo de e-mail (cabeçalhos `List-Unsubscribe` e `List-Unsubscribe-Post`, RFC 8058). A página `/sair-da-lista` confirma. Vale só para os lembretes: os e-mails do pedido continuam.
- **Estatísticas** (`/admin/estatisticas`): o cartão "Lembretes do carrinho" mostra os carrinhos lembrados no período, os e-mails enviados, quantos voltaram pelo link, quantos fizeram o pedido depois da volta e quantos pagaram, comparando com o período anterior. Alguns aplicativos de e-mail abrem os links sozinhos para conferir se são seguros: "voltaram" pode contar um pouco a mais; "fizeram o pedido" e "pagaram" não.

## Banco

Migração `supabase/migrations/20261113150000_emails_e_lembretes.sql`, **não aplicada**: `carrinhos_lembretes` (quando saiu cada lembrete e quando o cliente voltou, numa tabela separada para não mexer no `atualizado_em` do carrinho, que é a última vez que o cliente mexeu nele) e `emails_sem_lembrete` (quem saiu da lista), RLS ligado sem políticas, como as outras. Aplicar **antes** de pôr a `RESEND_API_KEY`. Os tipos já estão em `src/lib/banco-tipos.ts`; depois de aplicar, regenerar (formato cru do gerador). Sem a migração, as estatísticas mostram o funil sem os lembretes e o agendamento responde com erro, sem mandar nada.

No computador (sem o banco) tudo funciona com arquivos: os lembretes ficam no próprio arquivo do carrinho (`.data/carrinhos/`) e a lista de quem saiu em `.data/emails-sem-lembrete.json`.

## O que falta do dono

1. Criar a conta grátis do Resend (resend.com) e adicionar o domínio `orlanativa.online` na região **São Paulo (sa-east-1)**, a mais perto dos clientes e da Vercel (gru1).
2. Os registros de DNS que o Resend mostrar (MX e TXT em `send`, TXT `resend._domainkey`; e, recomendado, um DMARC `_dmarc` com `v=DMARC1; p=none;`) entram no DNS do orlanativa.online, que está na Vercel.
3. Criar a chave: API Keys → Create API Key → Permission **Sending access** → Domain **orlanativa.online**. Colar na Vercel como `RESEND_API_KEY` (Sensitive) e publicar de novo. Antes disso, aplicar a migração.
4. Conferir um envio de verdade (um pedido de teste) e, no Resend, se o e-mail chegou sem cair no spam.

## Testes

`tests/email.test.ts` (montagem de cada e-mail nos 4 idiomas, sem marcador sobrando, escapes, WhatsApp só no pago, sem dado legal, o desligado sem a chave, o corpo que o Resend recebe e as respostas dele), `tests/lembretes.test.ts` (quando o lembrete sai, os links assinados, as estatísticas), `tests/consulta-pedido.test.ts` (a consulta nunca revela pedido alheio) e `tests/es-ar.test.ts` (as frases do es-ar dos e-mails e das páginas, pela regra argentino → neutro).
