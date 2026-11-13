-- Etapa 7: o que falta nas casas para a página do site, o painel e o calendário nos dois sentidos.

-- A praia ou o bairro aparece nos três idiomas (a tabela ainda não tem nenhuma casa).
alter table public.casas
  alter column bairro type jsonb using case when bairro is null then null else jsonb_build_object('pt', bairro) end;

alter table public.casas
  add column cancelamento jsonb not null default '{}'::jsonb,
  add column check_in text,
  add column check_out text,
  add column ical_token uuid not null default gen_random_uuid() unique,
  add column ical_erro text;

comment on column public.casas.ical_token is 'O código secreto do link .ics que vai para o Airbnb.';
comment on column public.casas.ical_erro is 'O motivo da última importação do Airbnb que falhou. Vazio quando deu certo.';

-- As diárias por período: o feriado vale por cima da temporada, e o nome aparece nos três idiomas.
alter table public.casas_tarifas
  add column tipo text not null default 'temporada' check (tipo in ('temporada', 'feriado'));
alter table public.casas_tarifas rename column descricao to nome;
alter table public.casas_tarifas
  alter column nome type jsonb using case when nome is null then null else jsonb_build_object('pt', nome) end;

comment on column public.casas_tarifas.fim is 'O dia seguinte à última noite do período, como em casas_bloqueios.';

-- Troca de uma vez os bloqueios que vieram do Airbnb: ou entra tudo, ou nada.
-- Só o servidor do site (service_role) chama esta função.
create or replace function public.trocar_bloqueios_airbnb(p_casa uuid, p_bloqueios jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.casas_bloqueios where casa_id = p_casa and origem = 'airbnb';
  insert into public.casas_bloqueios (casa_id, inicio, fim, origem, referencia)
    select p_casa, (b ->> 'inicio')::date, (b ->> 'fim')::date, 'airbnb', b ->> 'referencia'
    from jsonb_array_elements(coalesce(p_bloqueios, '[]'::jsonb)) as b;
end;
$$;

revoke execute on function public.trocar_bloqueios_airbnb(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.trocar_bloqueios_airbnb(uuid, jsonb) to service_role;
