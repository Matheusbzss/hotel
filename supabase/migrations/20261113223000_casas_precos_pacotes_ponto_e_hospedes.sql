-- Casas (Fase 4, Etapa 7, parte B): diária de fim de semana, regra do fim de semana, pacotes de datas fixas, lavabos,
-- quartos, comodidades, destaques, regras próprias e texto do bairro; o ponto do mapa marcado pelo dono, numa tabela
-- privada; o cadastro dos hóspedes; e a função que confere TODOS os bloqueios antes de prender as datas.
-- O plano está em material-recebido/ETAPA-7-PLANO-DAS-CASAS.md; a conta do preço em src/lib/estadia.ts; a forma dos
-- dados novos em src/lib/casa-detalhes.ts; o círculo em src/lib/circulo-casa.ts; o cadastro dos hóspedes em
-- src/lib/hospedes.ts.
--
-- NÃO APLICADA no banco ainda. Esta migração só ACRESCENTA: nenhuma coluna, tabela, trava ou função que já existe é
-- apagada, renomeada ou trocada. Nada aqui muda o que o cliente vê (nenhuma casa está no ar), e o código lê as colunas
-- novas como vazias enquanto elas não existem. O agendamento diário (/api/saude) chama apagar_hospedes_vencidos e,
-- enquanto ela não existir, só registra o aviso. Aplicar antes de cadastrar as casas (scripts/cadastrar-casas.ts).
--
-- Como nas migrações anteriores: só o servidor do site (service_role) lê e grava; RLS ligado sem políticas; as funções
-- rodam com search_path vazio e execução concedida só ao service_role. Os grants das tabelas novas vêm dos "default
-- privileges" da 20261103135632_permissoes_servidor.sql.

-- ============================================================
-- CASAS: preço, banheiros e detalhes da página
-- ============================================================
alter table public.casas
  add column diaria_fim_de_semana_centavos integer check (diaria_fim_de_semana_centavos >= 0),
  add column fim_de_semana_junto boolean not null default true,
  add column lavabos integer not null default 0 check (lavabos between 0 and 20),
  add column quartos_detalhe jsonb not null default '[]'::jsonb check (jsonb_typeof(quartos_detalhe) = 'array'),
  add column comodidades_marcadas jsonb not null default '[]'::jsonb check (jsonb_typeof(comodidades_marcadas) = 'array'),
  add column destaques jsonb not null default '[]'::jsonb check (jsonb_typeof(destaques) = 'array'),
  add column regras_proprias jsonb not null default '{}'::jsonb check (jsonb_typeof(regras_proprias) = 'object'),
  add column texto_bairro jsonb check (texto_bairro is null or jsonb_typeof(texto_bairro) = 'object');

comment on column public.casas.diaria_base_centavos is 'A diária de semana (noites de segunda a sexta), em centavos.';
comment on column public.casas.diaria_fim_de_semana_centavos is 'A diária das noites de sábado e domingo, em centavos. Vazia: vale a diária de semana.';
comment on column public.casas.fim_de_semana_junto is 'As noites de sexta, sábado e domingo andam juntas (entra até sexta, sai segunda ou depois); estadia de 7 noites ou mais fica livre (src/lib/estadia.ts).';
comment on column public.casas.banheiros is 'Os banheiros inteiros (com chuveiro). O lavabo fica em lavabos.';
comment on column public.casas.lavabos is 'Os lavabos (meio banheiro, sem chuveiro). A ficha mostra banheiros + lavabos / 2: 3 banheiros e 1 lavabo = 3,5 banheiros.';
comment on column public.casas.quartos_detalhe is 'Cada quarto: nome nos idiomas, camas (tipo e quantidade, src/data/comodidades.ts), banheiro próprio (vazio = o dono ainda não disse), foto opcional do próprio quarto e um detalhe. Forma em src/lib/casa-detalhes.ts.';
comment on column public.casas.comodidades_marcadas is 'As comodidades da lista fixa (src/data/comodidades.ts), na ordem da página: o código, a marca "veio da foto" e um detalhe opcional.';
comment on column public.casas.destaques is 'De 3 a 4 destaques da página, cada um com ícone e texto nos idiomas, só com o que o dono confirmou.';
comment on column public.casas.regras_proprias is 'As regras da casa além das de todas as casas: evento, fumar, escadas e câmeras externas. Vazio = o dono ainda não disse (a página não escreve nada sobre isso).';
comment on column public.casas.texto_bairro is 'O texto curto sobre o bairro ("Onde você vai estar"), nos idiomas. Mostrar ao dono antes de publicar.';

-- ============================================================
-- PACOTES DE DATAS FIXAS ("Pacote Carnaval", "Pacote Réveillon"...)
-- ============================================================
-- Quem pega uma noite do pacote leva o pacote inteiro, com todas as diárias no preço do pacote; ele substitui a regra do
-- fim de semana e o mínimo de noites. Pacotes com o mesmo grupo são opções do mesmo feriado (o Réveillon de 4 ou de 5
-- diárias): a estadia leva uma delas inteira. O nome é sempre "Pacote" + o feriado, nunca "promoção" (CDC).
create table public.casas_pacotes (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas (id) on delete cascade,
  nome jsonb not null check (jsonb_typeof(nome) = 'object'),
  entrada date not null,
  saida date not null,
  diaria_centavos integer not null check (diaria_centavos > 0),
  grupo text check (grupo is null or grupo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  criado_em timestamptz not null default now(),
  check (saida > entrada),
  -- dois pacotes de feriados diferentes nunca dividem uma noite; as opções do mesmo grupo podem
  constraint casas_pacotes_sem_sobreposicao
    exclude using gist (casa_id with =, daterange(entrada, saida, '[)') with &&, (coalesce(grupo, id::text)) with <>)
);
create index casas_pacotes_casa_idx on public.casas_pacotes (casa_id, entrada);
alter table public.casas_pacotes enable row level security;
comment on table public.casas_pacotes is 'Pacotes de datas fixas de cada casa (feriadões, Carnaval, Réveillon), com todas as diárias no preço do pacote.';
comment on column public.casas_pacotes.saida is 'O dia da saída: a noite dele fica fora do pacote, como em casas_bloqueios.';
comment on column public.casas_pacotes.grupo is 'Pacotes com o mesmo grupo são opções do mesmo feriado (ex.: reveillon-2026, com 4 e 5 diárias): o cliente escolhe uma.';

-- ============================================================
-- O PONTO DA CASA NO MAPA (PRIVADO) E O CENTRO DO CÍRCULO PÚBLICO
-- ============================================================
-- O ponto marcado pelo dono no painel fica AQUI, numa tabela separada, porque o site lê a tabela casas com "tudo"
-- (select *): o ponto nunca pode ir para a página, o HTML ou o JavaScript. A página só pode ler centro_lat e
-- centro_lng (nunca select * desta tabela fora do painel): o centro de um círculo de 500 m de raio, deslocado do ponto.
-- O deslocamento (de 150 a 350 m, numa direção qualquer) é sorteado pelo banco UMA vez, quando o ponto é marcado; se o
-- dono mudar o alfinete, o centro anda junto, com o mesmo deslocamento. Como 350 m < 500 m, a casa fica sempre dentro
-- do círculo. Não apague a linha para marcar de novo: o sorteio seria refeito, e dois círculos diferentes da mesma
-- casa, cruzados, mostrariam onde ela fica.
create table public.casas_pontos (
  casa_id uuid primary key references public.casas (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  deslocamento_m double precision not null default (150 + random() * 200) check (deslocamento_m >= 150 and deslocamento_m <= 350),
  direcao_graus double precision not null default (random() * 360) check (direcao_graus >= 0 and direcao_graus < 360),
  centro_lat double precision not null default 0,
  centro_lng double precision not null default 0,
  marcado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.casas_pontos enable row level security;
comment on table public.casas_pontos is 'PRIVADO: o ponto da casa marcado pelo dono e o deslocamento sorteado. A página só lê centro_lat e centro_lng.';
comment on column public.casas_pontos.lat is 'O ponto exato da casa (privado: só o servidor e o painel).';
comment on column public.casas_pontos.deslocamento_m is 'A distância do ponto ao centro do círculo, em metros, sorteada uma vez (150 a 350).';
comment on column public.casas_pontos.direcao_graus is 'A direção do deslocamento, em graus a partir do norte, no sentido do relógio, sorteada uma vez.';
comment on column public.casas_pontos.centro_lat is 'O centro do círculo público (calculado pelo gatilho casas_pontos_centro): o único dado desta tabela que a página pode usar.';

-- Sorteia o deslocamento na primeira marcação (desprezando o que vier de fora) e o mantém nas seguintes; calcula o
-- centro: o ponto de destino numa esfera de raio 6.371.008,8 m, a mesma conta de src/lib/circulo-casa.ts.
create or replace function public.casas_pontos_centro()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  raio constant double precision := 6371008.8;
  d double precision;
  t double precision;
  f1 double precision;
  f2 double precision;
begin
  if tg_op = 'INSERT' then
    new.deslocamento_m := 150 + random() * 200;
    new.direcao_graus := random() * 360;
    new.marcado_em := now();
  else
    new.casa_id := old.casa_id;
    new.deslocamento_m := old.deslocamento_m;
    new.direcao_graus := old.direcao_graus;
    new.marcado_em := old.marcado_em;
  end if;
  d := new.deslocamento_m / raio;
  t := radians(new.direcao_graus);
  f1 := radians(new.lat);
  f2 := asin(sin(f1) * cos(d) + cos(f1) * sin(d) * cos(t));
  new.centro_lat := degrees(f2);
  new.centro_lng := degrees(radians(new.lng) + atan2(sin(t) * sin(d) * cos(f1), cos(d) - sin(f1) * sin(f2)));
  new.atualizado_em := now();
  return new;
end;
$$;
revoke execute on function public.casas_pontos_centro() from public, anon, authenticated;
grant execute on function public.casas_pontos_centro() to service_role;

create trigger casas_pontos_centro before insert or update on public.casas_pontos
  for each row execute function public.casas_pontos_centro();

-- ============================================================
-- CADASTRO DOS HÓSPEDES (privado; apagado 30 dias depois da saída)
-- ============================================================
-- Depois do pagamento confirmado, o cliente informa cada hóspede: nome completo, tipo e número do documento (sem foto)
-- e, se vier de carro, a placa (basta na linha de quem dirige). É para a portaria e para a segurança da equipe: só o
-- painel vê. A função apagar_hospedes_vencidos, chamada pelo agendamento diário, apaga a lista 30 dias depois da
-- saída (decisão da pendência 11; o pedido continua). Some também junto com o item do pedido.
create table public.casas_hospedes (
  id uuid primary key default gen_random_uuid(),
  item_pedido_id uuid not null references public.itens_pedido (id) on delete cascade,
  ordem smallint not null default 1 check (ordem between 1 and 60),
  nome text not null check (char_length(btrim(nome)) between 3 and 120),
  documento_tipo text not null check (documento_tipo in ('cpf','rg','dni','rut','passaporte','outro')),
  documento_numero text not null check (char_length(btrim(documento_numero)) between 3 and 30),
  placa text check (placa is null or char_length(btrim(placa)) between 5 and 10),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (item_pedido_id, ordem)
);
create trigger casas_hospedes_atualizado_em before update on public.casas_hospedes
  for each row execute function public.tocar_atualizado_em();
alter table public.casas_hospedes enable row level security;
comment on table public.casas_hospedes is 'PRIVADO: o cadastro dos hóspedes de cada estadia (para a portaria). Apagado 30 dias depois da saída por apagar_hospedes_vencidos.';
comment on column public.casas_hospedes.placa is 'A placa do carro em que o hóspede chega, se vier de carro.';

-- Apaga a lista dos hóspedes das estadias que saíram há 30 dias ou mais (a data de hoje em Búzios). Devolve quantos
-- hóspedes saíram. Só o servidor do site (o agendamento diário de /api/saude) chama.
create or replace function public.apagar_hospedes_vencidos()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_apagados integer;
begin
  delete from public.casas_hospedes h
  using public.itens_pedido i
  where h.item_pedido_id = i.id
    and coalesce(i.data_fim, i.data) + 30 <= (now() at time zone 'America/Sao_Paulo')::date;
  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;
revoke execute on function public.apagar_hospedes_vencidos() from public, anon, authenticated;
grant execute on function public.apagar_hospedes_vencidos() to service_role;

-- ============================================================
-- PRENDER AS DATAS DAS CASAS DE UM PEDIDO, CONFERINDO TODOS OS BLOQUEIOS
-- ============================================================
-- A trava casas_bloqueios_sem_sobreposicao_site só impede uma reserva do site sobre outra do site: um bloqueio à mão
-- ou do calendário de fora (Airbnb) apareceria riscado no calendário, mas o banco aceitaria a reserva por cima. Esta
-- função é o caminho para prender as datas enquanto o cliente paga: trava as casas do pedido (sempre na ordem do id,
-- para dois pedidos ao mesmo tempo esperarem um pelo outro sem se travarem), confere cada estadia contra TODOS os
-- bloqueios da casa (reserva do site, bloqueio à mão e calendário de fora) e contra as outras estadias do mesmo pedido,
-- e só então grava todas, com a sessão de pagamento como referência. Tudo ou nada: devolve false, sem gravar nada, se
-- alguma noite já estiver ocupada.
-- p_estadias: [{ "casa_id": uuid, "inicio": "AAAA-MM-DD", "fim": "AAAA-MM-DD", "item_pedido_id": uuid }]
-- (fim = dia da saída, que fica livre).
create or replace function public.prender_datas_casas(p_estadias jsonb, p_referencia text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_estadias jsonb := coalesce(p_estadias, '[]'::jsonb);
begin
  if p_referencia is null or btrim(p_referencia) = '' then
    raise exception 'prender_datas_casas: falta a referência (a sessão de pagamento).';
  end if;
  if jsonb_typeof(v_estadias) <> 'array' then
    raise exception 'prender_datas_casas: as estadias vêm numa lista.';
  end if;
  if jsonb_array_length(v_estadias) = 0 then
    return true;
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_estadias) as x
    where (x ->> 'casa_id') is null or (x ->> 'inicio') is null or (x ->> 'fim') is null
      or (x ->> 'fim')::date <= (x ->> 'inicio')::date
  ) then
    raise exception 'prender_datas_casas: estadia sem casa ou com a saída antes da entrada.';
  end if;

  perform 1 from public.casas
    where id in (select (x ->> 'casa_id')::uuid from jsonb_array_elements(v_estadias) as x)
    order by id
    for update;

  -- alguma noite já ocupada na casa, venha o bloqueio de onde vier?
  if exists (
    select 1
    from jsonb_array_elements(v_estadias) as x
    join public.casas_bloqueios b on b.casa_id = (x ->> 'casa_id')::uuid
    where daterange(b.inicio, b.fim, '[)') && daterange((x ->> 'inicio')::date, (x ->> 'fim')::date, '[)')
  ) then
    return false;
  end if;

  -- duas estadias do mesmo pedido na mesma casa e nas mesmas noites também não passam
  if exists (
    select 1
    from jsonb_array_elements(v_estadias) with ordinality as a(x, i)
    join jsonb_array_elements(v_estadias) with ordinality as b(y, j) on a.i < b.j
    where (a.x ->> 'casa_id') = (b.y ->> 'casa_id')
      and daterange((a.x ->> 'inicio')::date, (a.x ->> 'fim')::date, '[)')
        && daterange((b.y ->> 'inicio')::date, (b.y ->> 'fim')::date, '[)')
  ) then
    return false;
  end if;

  insert into public.casas_bloqueios (casa_id, inicio, fim, origem, referencia, item_pedido_id)
    select (x ->> 'casa_id')::uuid, (x ->> 'inicio')::date, (x ->> 'fim')::date, 'site', p_referencia, (x ->> 'item_pedido_id')::uuid
    from jsonb_array_elements(v_estadias) as x;
  return true;
exception when exclusion_violation then
  -- uma estadia do site gravada por outro caminho no mesmo instante: a trava antiga ainda segura
  return false;
end;
$$;
revoke execute on function public.prender_datas_casas(jsonb, text) from public, anon, authenticated;
grant execute on function public.prender_datas_casas(jsonb, text) to service_role;
