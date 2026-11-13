-- Avaliações: o título que a pessoa deu, a cidade e a foto de perfil.
-- O link de origem passa a ser opcional, por decisão do dono: as avaliações aparecem no site sem link.
-- A origem continua obrigatória, para o painel saber de onde cada uma veio.
alter table public.avaliacoes add column titulo text;
alter table public.avaliacoes add column cidade text;
alter table public.avaliacoes add column foto text;
alter table public.avaliacoes alter column origem_url drop not null;
