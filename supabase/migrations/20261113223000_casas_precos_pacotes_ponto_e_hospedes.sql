-- Casas (Fase 4, Etapa 7, parte B): diária de fim de semana, regra do fim de semana, pacotes de datas fixas, lavabos,
-- quartos, comodidades, destaques, regras próprias e texto do bairro; o ponto do mapa marcado pelo dono, numa tabela
-- fechada (nem o servidor lê direto), com o centro público do círculo na própria casa; o cadastro dos hóspedes; e a
-- função que confere TODOS os bloqueios antes de prender as datas.
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
-- privileges" da 20261103135632_permissoes_servidor.sql. A exceção é casas_pontos: o grant dela é tirado também do
-- service_role, e só as funções do painel (marcar_ponto_da_casa e ponto_da_casa) leem e gravam o ponto.

-- ============================================================
-- CASAS: preço, banheiros e detalhes da página
-- ============================================================
alter table public.casas
  add column diaria_fim_de_semana_centavos integer check (diaria_fim_de_semana_centavos > 0),
  add column fim_de_semana_junto boolean not null default true,
  add column lavabos integer not null default 0 check (lavabos between 0 and 20),
  add column quartos_detalhe jsonb not null default '[]'::jsonb check (jsonb_typeof(quartos_detalhe) = 'array'),
  add column comodidades_marcadas jsonb not null default '[]'::jsonb check (jsonb_typeof(comodidades_marcadas) = 'array'),
  add column destaques jsonb not null default '[]'::jsonb check (jsonb_typeof(destaques) = 'array'),
  add column regras_proprias jsonb not null default '{}'::jsonb check (jsonb_typeof(regras_proprias) = 'object'),
  add column texto_bairro jsonb check (texto_bairro is null or jsonb_typeof(texto_bairro) = 'object');

comment on column public.casas.diaria_base_centavos is 'A diária de semana (noites de segunda a sexta), em centavos.';
comment on column public.casas.diaria_fim_de_semana_centavos is 'A diária das noites de sábado e domingo, em centavos. Vazia: vale a diária de semana. Nunca zero: zero venderia o sábado e o domingo de graça (a conta, em src/lib/estadia.ts, também deixa sem preço a casa com uma diária zerada).';
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
-- O PONTO DA CASA NO MAPA (FECHADO) E O CENTRO DO CÍRCULO PÚBLICO (NA PRÓPRIA CASA)
-- ============================================================
-- O ponto marcado pelo dono no painel fica numa tabela à parte e FECHADA: o grant dela é tirado de todos os papéis da
-- API, inclusive do service_role, que o site e o painel usam. Assim nenhuma leitura da página (nem um select * de casas
-- com casas_pontos(*) embutido) traz o ponto: o banco recusa. Só duas funções do painel mexem nela:
-- marcar_ponto_da_casa (grava ou muda o alfinete) e ponto_da_casa (lê o alfinete para pô-lo no mapa do painel).
-- O deslocamento (de 150 a 350 m, numa direção qualquer) é sorteado pelo banco UMA vez, quando o ponto é marcado; se o
-- dono mudar o alfinete, o centro anda junto, com o mesmo deslocamento. A linha não se apaga (só junto com a casa):
-- marcar de novo refaria o sorteio, e dois círculos diferentes da mesma casa, cruzados, mostrariam onde ela fica.
-- O centro do círculo (500 m de raio; como 350 m < 500 m, a casa fica sempre dentro) vai para a própria casa, nas
-- colunas centro_lat e centro_lng: é o único dado do mapa que a página lê, e ela nunca precisa de casas_pontos.
alter table public.casas
  add column centro_lat double precision check (centro_lat between -90 and 90),
  add column centro_lng double precision check (centro_lng between -180 and 180);
comment on column public.casas.centro_lat is 'O centro do círculo público do mapa (500 m de raio), deslocado do ponto marcado pelo dono. Só o gatilho casas_pontos_centro escreve aqui; vazio enquanto o dono não marca a casa (a página esconde o mapa).';
comment on column public.casas.centro_lng is 'A longitude do centro do círculo público (ver centro_lat).';
comment on column public.casas.lat_aprox is 'O ponto aproximado antigo, digitado à mão no painel. A página das casas passa a usar centro_lat e centro_lng (parte F da Etapa 7).';

-- O centro só muda pelo ponto: um update direto (o painel, o editor de SQL) ou uma casa nova não escrevem o centro,
-- para nunca entrar ali o ponto exato digitado à mão. Quem escreve é o gatilho de casas_pontos (um gatilho dentro de
-- outro, por isso pg_trigger_depth() >= 2).
create or replace function public.casas_centro_so_pelo_ponto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() < 2 then
    if tg_op = 'INSERT' then
      new.centro_lat := null;
      new.centro_lng := null;
    else
      new.centro_lat := old.centro_lat;
      new.centro_lng := old.centro_lng;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.casas_centro_so_pelo_ponto() from public, anon, authenticated;
grant execute on function public.casas_centro_so_pelo_ponto() to service_role;

create trigger casas_centro_so_pelo_ponto before insert or update of centro_lat, centro_lng on public.casas
  for each row execute function public.casas_centro_so_pelo_ponto();

create table public.casas_pontos (
  casa_id uuid primary key references public.casas (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  deslocamento_m double precision not null default (150 + random() * 200) check (deslocamento_m >= 150 and deslocamento_m <= 350),
  direcao_graus double precision not null default (random() * 360) check (direcao_graus >= 0 and direcao_graus < 360),
  marcado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.casas_pontos enable row level security;
-- fechada: os "default privileges" deram o grant ao service_role; aqui ele sai, e nem o servidor do site lê ou grava
-- direto (o apagamento em cascata da casa roda com os direitos do dono da tabela e continua valendo)
revoke all on public.casas_pontos from public, anon, authenticated, service_role;
comment on table public.casas_pontos is 'FECHADA: o ponto da casa marcado pelo dono e o deslocamento sorteado. Só as funções marcar_ponto_da_casa e ponto_da_casa leem e gravam; a página usa casas.centro_lat e casas.centro_lng.';
comment on column public.casas_pontos.lat is 'O ponto exato da casa (fechado: só o painel o lê, pela função ponto_da_casa).';
comment on column public.casas_pontos.deslocamento_m is 'A distância do ponto ao centro do círculo, em metros, sorteada uma vez (150 a 350).';
comment on column public.casas_pontos.direcao_graus is 'A direção do deslocamento, em graus a partir do norte, no sentido do relógio, sorteada uma vez.';

-- Sorteia o deslocamento na primeira marcação (desprezando o que vier de fora) e o mantém nas seguintes.
create or replace function public.casas_pontos_sorteio()
returns trigger
language plpgsql
set search_path = ''
as $$
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
  new.atualizado_em := now();
  return new;
end;
$$;
revoke execute on function public.casas_pontos_sorteio() from public, anon, authenticated;
grant execute on function public.casas_pontos_sorteio() to service_role;

create trigger casas_pontos_sorteio before insert or update on public.casas_pontos
  for each row execute function public.casas_pontos_sorteio();

-- Depois de gravar o ponto, calcula o centro e o leva para a casa: o ponto de destino numa esfera de raio 6.371.008,8 m,
-- a mesma conta de src/lib/circulo-casa.ts. É um gatilho AFTER para nunca levar à casa o sorteio de um
-- "insert ... on conflict" que virou update (o BEFORE INSERT roda mesmo assim, e o sorteio dele é jogado fora).
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
  d := new.deslocamento_m / raio;
  t := radians(new.direcao_graus);
  f1 := radians(new.lat);
  f2 := asin(sin(f1) * cos(d) + cos(f1) * sin(d) * cos(t));
  update public.casas
    set centro_lat = degrees(f2),
        centro_lng = degrees(radians(new.lng) + atan2(sin(t) * sin(d) * cos(f1), cos(d) - sin(f1) * sin(f2)))
    where id = new.casa_id;
  return null;
end;
$$;
revoke execute on function public.casas_pontos_centro() from public, anon, authenticated;
grant execute on function public.casas_pontos_centro() to service_role;

create trigger casas_pontos_centro after insert or update on public.casas_pontos
  for each row execute function public.casas_pontos_centro();

-- Recusa apagar o ponto: na próxima marcação o sorteio seria refeito. Só passa o apagamento em cascata da própria
-- casa, que chega de dentro do gatilho da chave estrangeira (pg_trigger_depth() >= 2). Mudar o alfinete é sempre
-- atualizar (marcar_ponto_da_casa).
create or replace function public.casas_pontos_sem_apagar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'casas_pontos: o ponto da casa não se apaga (o sorteio do círculo seria refeito); para mudar o alfinete, use marcar_ponto_da_casa.';
  end if;
  return old;
end;
$$;
revoke execute on function public.casas_pontos_sem_apagar() from public, anon, authenticated;
grant execute on function public.casas_pontos_sem_apagar() to service_role;

create trigger casas_pontos_sem_apagar before delete on public.casas_pontos
  for each row execute function public.casas_pontos_sem_apagar();

-- O painel marca a casa ou muda o alfinete: a única forma de gravar o ponto. Roda com os direitos do dono da tabela
-- (security definer), porque o service_role não tem grant em casas_pontos. Na segunda marcação em diante é um update,
-- e o deslocamento sorteado na primeira continua o mesmo.
create or replace function public.marcar_ponto_da_casa(p_casa uuid, p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_casa is null or p_lat is null or p_lng is null then
    raise exception 'marcar_ponto_da_casa: falta a casa ou o ponto.';
  end if;
  insert into public.casas_pontos (casa_id, lat, lng)
    values (p_casa, p_lat, p_lng)
    on conflict (casa_id) do update set lat = excluded.lat, lng = excluded.lng;
end;
$$;
revoke execute on function public.marcar_ponto_da_casa(uuid, double precision, double precision) from public, anon, authenticated;
grant execute on function public.marcar_ponto_da_casa(uuid, double precision, double precision) to service_role;

-- O painel lê o ponto para pôr o alfinete onde ele está. Nenhuma página do site chama esta função (o teste
-- tests/casas-privado.test.ts confere que só o código do painel a cita, e que ninguém cita a tabela).
create or replace function public.ponto_da_casa(p_casa uuid)
returns table (lat double precision, lng double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select p.lat, p.lng from public.casas_pontos p where p.casa_id = p_casa;
$$;
revoke execute on function public.ponto_da_casa(uuid) from public, anon, authenticated;
grant execute on function public.ponto_da_casa(uuid) to service_role;

-- ============================================================
-- CADASTRO DOS HÓSPEDES (privado; apagado 30 dias depois da saída)
-- ============================================================
-- Depois do pagamento confirmado, o cliente informa cada hóspede: nome completo, tipo e número do documento (sem foto)
-- e, se vier de carro, a placa (basta na linha de quem dirige). É para a portaria e para a segurança da equipe: só o
-- painel vê. A função apagar_hospedes_vencidos, chamada pelo agendamento diário, apaga a lista 30 dias depois da
-- saída (decisão da pendência 11; o pedido continua), ou logo que a estadia é cancelada ou devolvida. Some também
-- junto com o item do pedido.
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
comment on table public.casas_hospedes is 'PRIVADO: o cadastro dos hóspedes de cada estadia (para a portaria). Apagado por apagar_hospedes_vencidos 30 dias depois da saída, ou logo que a estadia é cancelada ou devolvida.';
comment on column public.casas_hospedes.placa is 'A placa do carro em que o hóspede chega, se vier de carro.';

-- Apaga a lista dos hóspedes das estadias que saíram há 30 dias ou mais (a data de hoje em Búzios) e, na limpeza
-- seguinte, a das estadias que não vão acontecer: o item ou o pedido cancelado ou devolvido. Aí a finalidade (a
-- portaria) acabou, e guardar até 30 dias depois de uma saída que não vai existir prenderia o documento de todos por
-- quase um ano numa reserva feita cedo (LGPD, arts. 15 e 16). Devolve quantos hóspedes saíram. Só o servidor do site
-- (o agendamento diário de /api/saude) chama. A mesma regra, com testes, em cadastroVencido (src/lib/hospedes.ts).
create or replace function public.apagar_hospedes_vencidos()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_apagados integer;
begin
  delete from public.casas_hospedes h
  using public.itens_pedido i, public.pedidos p
  where h.item_pedido_id = i.id
    and p.id = i.pedido_id
    and (
      coalesce(i.data_fim, i.data) + 30 <= (now() at time zone 'America/Sao_Paulo')::date
      or i.status in ('cancelado', 'reembolsado')
      or p.status in ('cancelado', 'reembolsado')
    );
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
