-- Espanhol da Argentina ('es-ar') nos pedidos, carrinhos e cotações.
-- O site passou a ter duas versões do espanhol, cada uma no seu endereço: /es (neutro, com "tú") e
-- /es-ar (Argentina, com "vos"). O idioma gravado em cada pedido, carrinho e cotação passa a aceitar 'es-ar',
-- para o voucher, o e-mail e o painel saírem na versão que a pessoa estava lendo.
-- As avaliações NÃO mudam: continuam só com pt, es e en, porque uma avaliação em espanhol vale para as duas versões.
--
-- Os nomes das travas são os que o Postgres dá sozinho a um "check" sem nome, na coluna idioma: <tabela>_idioma_check
-- (criadas em 20261103135542_base_orla_nativa.sql, linhas 27, 83 e 105). "drop ... if exists" deixa o arquivo
-- seguro para rodar de novo.

alter table public.pedidos drop constraint if exists pedidos_idioma_check;
alter table public.pedidos add constraint pedidos_idioma_check check (idioma in ('pt','es','en','es-ar'));

alter table public.carrinhos drop constraint if exists carrinhos_idioma_check;
alter table public.carrinhos add constraint carrinhos_idioma_check check (idioma in ('pt','es','en','es-ar'));

alter table public.cotacoes drop constraint if exists cotacoes_idioma_check;
alter table public.cotacoes add constraint cotacoes_idioma_check check (idioma in ('pt','es','en','es-ar'));
