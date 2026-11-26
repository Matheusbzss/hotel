-- A opção "Enable automatic RLS" (marcada na criação do projeto) instalou a função public.rls_auto_enable,
-- que liga a trava de RLS sozinha em toda tabela nova. Ela não deve ser chamada de fora pela API:
-- só o próprio banco a usa, quando uma tabela é criada.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
