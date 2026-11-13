-- Cotação do dólar para os preços aproximados em espanhol e inglês ("≈ US$ 35,81").
-- O agendamento da Vercel (/api/cambio/atualizar, dia útil às 13h30 de Brasília) busca a PTAX de venda
-- do Banco Central (ou o Frankfurter, quando o BC falha) e grava uma linha por data; o site lê só a mais
-- nova. RLS ligada sem política, como nas outras tabelas: só o servidor (chave secreta) lê e grava.
create table public.cambio_dolar (
  id uuid primary key default gen_random_uuid(),
  -- a data da cotação no Banco Central (não a de quando foi buscada): uma linha por data
  data_ptax date not null unique,
  -- reais por dólar (ex.: 5.5013); fora da faixa de 1 a 20 é erro de leitura, não o dólar
  taxa numeric(10, 4) not null check (taxa > 1 and taxa < 20),
  -- de onde veio: 'bcb' ou 'frankfurter'
  fonte text not null,
  buscado_em timestamptz not null default now()
);
alter table public.cambio_dolar enable row level security;
