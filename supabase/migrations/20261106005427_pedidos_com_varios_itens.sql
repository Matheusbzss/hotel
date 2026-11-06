-- Pedido do carrinho: um pagamento e um voucher para cada item.
-- Só o servidor do site (service_role) chama estas funções; a chave pública do navegador não.

-- Cria o pedido com todos os itens: ou entra tudo, ou nada. O site manda cada linha completa em JSON.
-- Devolve false se algum código já existir, como pedido ou como voucher (o site sorteia outros).
create or replace function public.criar_pedido(p_pedido jsonb, p_itens jsonb, p_historico jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_pedido public.pedidos := jsonb_populate_record(null::public.pedidos, p_pedido);
  v_codigos text[] := array(select i ->> 'voucher_codigo' from jsonb_array_elements(p_itens) as i) || v_pedido.codigo;
begin
  if exists (select 1 from public.pedidos where codigo = any (v_codigos))
     or exists (select 1 from public.itens_pedido where voucher_codigo = any (v_codigos)) then
    return false;
  end if;
  insert into public.pedidos select v_pedido.*;
  insert into public.itens_pedido
    select * from jsonb_populate_recordset(null::public.itens_pedido, p_itens);
  insert into public.pedidos_historico (pedido_id, em, evento)
    select v_pedido.id, (h ->> 'em')::timestamptz, h ->> 'evento'
    from jsonb_array_elements(coalesce(p_historico, '[]'::jsonb)) as h;
  return true;
exception when unique_violation then
  return false;
end;
$$;

revoke execute on function public.criar_pedido(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.criar_pedido(jsonb, jsonb, jsonb) to service_role;

-- Igual à anterior, com uma diferença: o pedido é um pagamento só, então todos os vouchers acompanham
-- o status do item que mudou (cancelado, reembolsado ou ativo).
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

  update public.itens_pedido set status = i.status
  where pedido_id = v_id and voucher_codigo <> i.voucher_codigo;

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
