-- Quem pode mexer nas tabelas pela API do banco (Data API).
-- O projeto foi criado sem expor tabelas novas: sem permissão explícita, ninguém lê nem grava.
-- Só o servidor do site (chave secreta, papel service_role) recebe acesso, nas tabelas de hoje e nas
-- que vierem. A chave pública do navegador (papéis anon e authenticated) fica sem acesso nenhum,
-- além da trava de RLS que já vale em todas as tabelas.

grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
