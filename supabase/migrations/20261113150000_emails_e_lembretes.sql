-- Os lembretes do carrinho abandonado (Fase 4, Etapa 6). O desenho está em docs/emails.md.
--
-- NÃO APLICADA no banco ainda. Aplicar ANTES de cadastrar a RESEND_API_KEY na Vercel: sem a chave, nada daqui é
-- usado (os e-mails ficam desligados); com a chave e sem estas tabelas, o agendamento dos lembretes responde com
-- erro e não manda nada, e a página de estatísticas mostra o funil sem os lembretes. Nada aqui muda o que o
-- cliente vê nem os dados que já existem.
--
-- Como nas migrações anteriores: só o servidor do site (service_role) lê e grava; RLS ligado sem políticas. Os
-- grants das tabelas novas vêm dos "default privileges" da 20261103135632_permissoes_servidor.sql. Não há função
-- nova (a reserva do lembrete é um update condicional comum, "onde a coluna ainda está vazia").

-- ============================================================
-- LEMBRETES DE CADA CARRINHO
-- ============================================================
-- Uma linha por carrinho que recebeu algum lembrete: quando saiu o primeiro (1 hora sem mexer no carrinho), quando
-- saiu o segundo (24 horas) e quando o cliente voltou pelo link do e-mail (a primeira vez), com o número do
-- lembrete que o trouxe. Fica numa tabela separada para não tocar no atualizado_em de carrinhos, que é a última vez
-- que o CLIENTE mexeu no carrinho e é por ele que o agendamento decide quando lembrar.
create table public.carrinhos_lembretes (
  carrinho_id uuid primary key references public.carrinhos (id) on delete cascade,
  lembrete_1_em timestamptz,
  lembrete_2_em timestamptz,
  voltou_em timestamptz,
  voltou_lembrete smallint check (voltou_lembrete in (1, 2)),
  criado_em timestamptz not null default now()
);
-- a contagem do dia (no máximo 30 lembretes por dia, para sobrar cota do Resend para os e-mails dos pedidos)
create index carrinhos_lembretes_1_idx on public.carrinhos_lembretes (lembrete_1_em);
create index carrinhos_lembretes_2_idx on public.carrinhos_lembretes (lembrete_2_em);
alter table public.carrinhos_lembretes enable row level security;
comment on table public.carrinhos_lembretes is 'Lembretes do carrinho abandonado: quando saiu cada um e quando o cliente voltou pelo link do e-mail.';
comment on column public.carrinhos_lembretes.voltou_lembrete is 'Qual lembrete (1 ou 2) trouxe o cliente de volta na primeira volta.';

-- A busca do agendamento (a cada 15 minutos): carrinhos com e-mail, sem pedido, parados entre 1 hora e 3 dias.
create index carrinhos_para_lembrar_idx on public.carrinhos (atualizado_em) where email is not null and pedido_id is null;

-- ============================================================
-- QUEM SAIU DA LISTA DOS LEMBRETES
-- ============================================================
-- O e-mail (sempre em minúsculas) de quem tocou em "não quero mais receber lembretes" ou no "cancelar inscrição"
-- do aplicativo de e-mail. Vale só para os lembretes do carrinho: os e-mails do pedido (pedido recebido, pagamento
-- aprovado, Pix vencido, link do pedido) continuam.
create table public.emails_sem_lembrete (
  email text primary key check (email = lower(email)),
  criado_em timestamptz not null default now()
);
alter table public.emails_sem_lembrete enable row level security;
comment on table public.emails_sem_lembrete is 'E-mails que saíram da lista dos lembretes do carrinho abandonado.';
