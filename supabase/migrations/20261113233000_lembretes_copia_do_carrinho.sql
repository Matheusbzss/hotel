-- A cópia do carrinho aberta pelo link "voltar ao carrinho" do lembrete (Fase 4, Etapa 6, revisão de 13/11). O desenho
-- está em docs/emails.md.
--
-- NÃO APLICADA no banco ainda. Aplicar DEPOIS da 20261113150000_emails_e_lembretes.sql e ANTES de cadastrar a
-- RESEND_API_KEY na Vercel. Sem a chave, nada daqui é usado. Nada aqui muda o que o cliente vê nem os dados que já existem.
--
-- Por quê: o link do e-mail não entrega mais o código do carrinho que recebeu o lembrete (quem abrisse o link
-- encaminhado dividiria o carrinho com o cliente e veria o pedido nascido dele). A volta abre um carrinho NOVO, só com
-- os itens, e esta coluna liga a cópia ao carrinho de origem: a cópia nunca recebe lembrete, o link de um carrinho cuja
-- cópia virou pedido leva a "Consultar meu pedido", e as estatísticas contam o pedido da cópia como o do carrinho que
-- recebeu o e-mail.
--
-- Sem chave estrangeira de propósito: carrinhos_lembretes já aponta para carrinhos (carrinho_id), e uma segunda ligação
-- entre as duas tabelas deixaria ambíguo o carrinhos_lembretes(...) que o site pede junto com carrinhos. Quando o
-- carrinho de origem some, a cópia continua um carrinho comum. Como nas migrações anteriores: RLS ligado sem políticas
-- (a tabela já está assim) e só o servidor do site (service_role) lê e grava.

alter table public.carrinhos_lembretes add column if not exists veio_de uuid;
comment on column public.carrinhos_lembretes.veio_de is 'Na cópia aberta pelo link "voltar ao carrinho": o id do carrinho que recebeu o lembrete.';
create index if not exists carrinhos_lembretes_veio_de_idx on public.carrinhos_lembretes (veio_de) where veio_de is not null;
