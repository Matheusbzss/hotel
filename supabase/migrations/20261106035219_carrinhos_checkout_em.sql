-- O funil das estatísticas: guarda quando o carrinho chegou ao checkout pela primeira vez.
alter table public.carrinhos add column checkout_em timestamptz;

comment on column public.carrinhos.checkout_em is 'A primeira vez que este carrinho abriu o checkout (funil das estatísticas).';
