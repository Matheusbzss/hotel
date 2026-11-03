-- Gravar uma reserva inteira (pedido, item e histórico) de uma vez só: ou entra tudo, ou nada.
-- Só o servidor do site (service_role) chama estas funções; a chave pública do navegador não.
-- O site manda cada linha completa em JSON, com todas as colunas (inclusive o id).

-- Cria a reserva. Devolve false se o código já existir (o site sorteia outro código).
create or replace function public.criar_reserva(p_pedido jsonb, p_item jsonb, p_historico jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_pedido public.pedidos := jsonb_populate_record(null::public.pedidos, p_pedido);
  v_item public.itens_pedido := jsonb_populate_record(null::public.itens_pedido, p_item);
begin
  if exists (select 1 from public.pedidos where codigo = v_pedido.codigo)
     or exists (select 1 from public.itens_pedido where voucher_codigo = v_item.voucher_codigo) then
    return false;
  end if;
  v_item.pedido_id := v_pedido.id;
  insert into public.pedidos select v_pedido.*;
  insert into public.itens_pedido select v_item.*;
  insert into public.pedidos_historico (pedido_id, em, evento)
    select v_pedido.id, (h ->> 'em')::timestamptz, h ->> 'evento'
    from jsonb_array_elements(coalesce(p_historico, '[]'::jsonb)) as h;
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- Atualiza a reserva, desde que ninguém tenha mexido nela depois da leitura (p_versao = atualizado_em
-- lido; nulo grava por cima). Os eventos do histórico que ainda não estão no banco são acrescentados.
-- Devolve false se a reserva mudou nesse meio-tempo (o site lê de novo e tenta outra vez).
create or replace function public.atualizar_reserva(p_versao timestamptz, p_pedido jsonb, p_item jsonb, p_historico jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  p public.pedidos := jsonb_populate_record(null::public.pedidos, p_pedido);
  i public.itens_pedido := jsonb_populate_record(null::public.itens_pedido, p_item);
  v_id uuid;
begin
  update public.pedidos set
    status = p.status,
    idioma = p.idioma,
    cliente_nome = p.cliente_nome,
    cliente_email = p.cliente_email,
    cliente_telefone = p.cliente_telefone,
    cliente_documento_tipo = p.cliente_documento_tipo,
    cliente_documento = p.cliente_documento,
    cliente_pais = p.cliente_pais,
    metodo_pagamento = p.metodo_pagamento,
    pagamento = p.pagamento,
    subtotal_centavos = p.subtotal_centavos,
    desconto_centavos = p.desconto_centavos,
    total_centavos = p.total_centavos,
    total_pix_centavos = p.total_pix_centavos,
    moeda = p.moeda,
    origem_utm = p.origem_utm,
    observacoes = p.observacoes,
    pago_em = p.pago_em
  where codigo = p.codigo and (p_versao is null or atualizado_em = p_versao)
  returning id into v_id;
  if v_id is null then
    return false;
  end if;

  update public.itens_pedido set
    tipo = i.tipo,
    produto_slug = i.produto_slug,
    produto_nome = i.produto_nome,
    cidade = i.cidade,
    opcao = i.opcao,
    data = i.data,
    horario = i.horario,
    data_fim = i.data_fim,
    pessoas = i.pessoas,
    unidades = i.unidades,
    preco_centavos = i.preco_centavos,
    sinal_centavos = i.sinal_centavos,
    detalhes = i.detalhes,
    status = i.status
  where pedido_id = v_id and voucher_codigo = i.voucher_codigo;

  insert into public.pedidos_historico (pedido_id, em, evento)
    select v_id, (h ->> 'em')::timestamptz, h ->> 'evento'
    from jsonb_array_elements(coalesce(p_historico, '[]'::jsonb)) as h
    where not exists (
      select 1 from public.pedidos_historico x
      where x.pedido_id = v_id and x.em = (h ->> 'em')::timestamptz and x.evento = h ->> 'evento'
    );
  return true;
end;
$$;

revoke execute on function public.criar_reserva(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.atualizar_reserva(timestamptz, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.criar_reserva(jsonb, jsonb, jsonb) to service_role;
grant execute on function public.atualizar_reserva(timestamptz, jsonb, jsonb, jsonb) to service_role;
