-- Teste de saúde do banco (/api/saude): o site grava uma linha aqui, lê de volta e apaga em seguida.
-- O agendamento diário da Vercel roda esse teste todo dia, e assim o plano grátis do Supabase não pausa
-- o projeto por falta de uso.
create table public.saude (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now()
);
alter table public.saude enable row level security;
