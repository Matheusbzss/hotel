-- Base de dados da Orla Nativa (Fase 3).
-- Acesso só pelo servidor do site (chave secreta): RLS ligado em todas as tabelas, sem políticas públicas.

create extension if not exists btree_gist with schema extensions;

-- Atualiza "atualizado_em" sozinho
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- ============================================================
-- PEDIDOS (um pagamento) e ITENS (passeio, transfer ou casa)
-- ============================================================
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  token text not null,
  status text not null default 'pendente'
    check (status in ('pendente','pago','recusado','cancelado','expirado','reembolsado','parcial')),
  idioma text not null default 'es' check (idioma in ('pt','es','en')),
  cliente_nome text not null,
  cliente_email text not null,
  cliente_telefone text not null,
  cliente_documento_tipo text check (cliente_documento_tipo in ('cpf','passaporte','dni','rut','outro')),
  cliente_documento text,
  cliente_pais text,
  metodo_pagamento text check (metodo_pagamento in ('pix','cartao')),
  pagamento jsonb not null default '{}'::jsonb,
  subtotal_centavos integer not null check (subtotal_centavos >= 0),
  desconto_centavos integer not null default 0 check (desconto_centavos >= 0),
  total_centavos integer not null check (total_centavos >= 0),
  moeda text not null default 'BRL',
  origem_utm jsonb not null default '{}'::jsonb,
  observacoes text,
  pago_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index pedidos_criado_em_idx on public.pedidos (criado_em desc);
create index pedidos_status_idx on public.pedidos (status);
create index pedidos_email_idx on public.pedidos (lower(cliente_email));
create trigger pedidos_atualizado_em before update on public.pedidos
  for each row execute function public.tocar_atualizado_em();

create table public.itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  tipo text not null check (tipo in ('passeio','transfer','casa')),
  produto_slug text not null,
  produto_nome text not null,
  cidade text,
  opcao jsonb,
  data date not null,
  horario time,
  data_fim date,
  pessoas jsonb not null default '{}'::jsonb,
  unidades integer not null default 1 check (unidades > 0),
  preco_centavos integer not null check (preco_centavos >= 0),
  sinal_centavos integer check (sinal_centavos >= 0),
  detalhes jsonb not null default '{}'::jsonb,
  voucher_codigo text unique,
  status text not null default 'ativo' check (status in ('ativo','cancelado','reembolsado','usado')),
  criado_em timestamptz not null default now(),
  check (data_fim is null or data_fim > data)
);
create index itens_pedido_pedido_idx on public.itens_pedido (pedido_id);
create index itens_pedido_data_idx on public.itens_pedido (data);
create index itens_pedido_produto_idx on public.itens_pedido (produto_slug);

-- ============================================================
-- CARRINHOS (para recuperar carrinho abandonado depois)
-- ============================================================
create table public.carrinhos (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  idioma text not null default 'es' check (idioma in ('pt','es','en')),
  email text,
  itens jsonb not null default '[]'::jsonb,
  origem_utm jsonb not null default '{}'::jsonb,
  pedido_id uuid references public.pedidos (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index carrinhos_atualizado_em_idx on public.carrinhos (atualizado_em desc);
create index carrinhos_pedido_idx on public.carrinhos (pedido_id);
create trigger carrinhos_atualizado_em before update on public.carrinhos
  for each row execute function public.tocar_atualizado_em();

-- ============================================================
-- COTAÇÕES (transfer fora da tabela, casas, outros pedidos)
-- ============================================================
create table public.cotacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('transfer','casa','pacote','outro')),
  nome text not null,
  email text not null,
  telefone text,
  idioma text not null default 'es' check (idioma in ('pt','es','en')),
  mensagem text,
  dados jsonb not null default '{}'::jsonb,
  status text not null default 'nova' check (status in ('nova','respondida','fechada','perdida')),
  origem_utm jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index cotacoes_status_idx on public.cotacoes (status, criado_em desc);
create trigger cotacoes_atualizado_em before update on public.cotacoes
  for each row execute function public.tocar_atualizado_em();

-- ============================================================
-- AVALIAÇÕES (só reais: sempre com a origem e o link)
-- ============================================================
create table public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  pais text,
  produto_slug text,
  nota integer not null check (nota between 1 and 5),
  texto text not null,
  idioma text check (idioma in ('pt','es','en')),
  origem text not null check (origem in ('google','tripadvisor','instagram','whatsapp','email','site')),
  origem_url text not null,
  data_avaliacao date not null,
  publicada boolean not null default false,
  criado_em timestamptz not null default now()
);
create index avaliacoes_publicadas_idx on public.avaliacoes (publicada, data_avaliacao desc);

-- ============================================================
-- CASAS DE TEMPORADA (dados entram na Fase 3)
-- ============================================================
create table public.casas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  ativo boolean not null default false,
  cidade text not null check (cidade in ('buzios','arraial-do-cabo','cabo-frio')),
  bairro text,
  nome jsonb not null,
  resumo jsonb,
  descricao jsonb,
  endereco text,
  lat_aprox double precision,
  lng_aprox double precision,
  quartos integer not null check (quartos > 0),
  suites integer,
  banheiros integer,
  capacidade integer not null check (capacidade > 0),
  camas jsonb not null default '[]'::jsonb,
  comodidades jsonb not null default '[]'::jsonb,
  regras jsonb not null default '{}'::jsonb,
  diaria_base_centavos integer check (diaria_base_centavos >= 0),
  minimo_noites integer not null default 1 check (minimo_noites > 0),
  taxa_limpeza_centavos integer check (taxa_limpeza_centavos >= 0),
  caucao_centavos integer check (caucao_centavos >= 0),
  fotos jsonb not null default '[]'::jsonb,
  ical_url text,
  ical_sincronizado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create trigger casas_atualizado_em before update on public.casas
  for each row execute function public.tocar_atualizado_em();

-- Diária por temporada ou feriado
create table public.casas_tarifas (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas (id) on delete cascade,
  inicio date not null,
  fim date not null,
  diaria_centavos integer not null check (diaria_centavos >= 0),
  minimo_noites integer check (minimo_noites > 0),
  descricao text,
  check (fim > inicio)
);
create index casas_tarifas_casa_idx on public.casas_tarifas (casa_id, inicio);

-- Datas ocupadas. "fim" é o dia da saída (não conta como noite).
-- Duas reservas do site nunca podem se sobrepor na mesma casa (trava no próprio banco).
create table public.casas_bloqueios (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas (id) on delete cascade,
  inicio date not null,
  fim date not null,
  origem text not null check (origem in ('site','airbnb','manual')),
  referencia text,
  item_pedido_id uuid references public.itens_pedido (id) on delete cascade,
  criado_em timestamptz not null default now(),
  check (fim > inicio),
  constraint casas_bloqueios_sem_sobreposicao_site
    exclude using gist (casa_id with =, daterange(inicio, fim, '[)') with &&)
    where (origem = 'site')
);
create index casas_bloqueios_casa_idx on public.casas_bloqueios (casa_id, inicio);
create index casas_bloqueios_item_idx on public.casas_bloqueios (item_pedido_id);

-- ============================================================
-- Segurança: ninguém de fora lê ou escreve; só o servidor do site.
-- ============================================================
alter table public.pedidos enable row level security;
alter table public.itens_pedido enable row level security;
alter table public.carrinhos enable row level security;
alter table public.cotacoes enable row level security;
alter table public.avaliacoes enable row level security;
alter table public.casas enable row level security;
alter table public.casas_tarifas enable row level security;
alter table public.casas_bloqueios enable row level security;
