-- Avaliações: sobre o quê cada uma fala.
-- 'agencia' entra na nota da agência; 'destino' é sobre a cidade (Rua das Pedras, Orla Bardot...)
-- e nunca entra na nota. 'lugar' guarda o ponto da cidade comentado, quando houver.
-- As 5 avaliações de hoje são da página da própria agência no Tripadvisor: o padrão 'agencia' já as marca certo.
alter table public.avaliacoes add column sobre text not null default 'agencia' check (sobre in ('agencia','destino'));
alter table public.avaliacoes add column lugar text;
