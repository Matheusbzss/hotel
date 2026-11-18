/**
 * Um texto com {email} no meio ("Não recebeu? Escreva para {email}."): o endereço vira um link de e-mail, que no
 * celular abre o aplicativo num toque, em vez de texto para copiar. Serve às páginas e aos componentes do navegador.
 */
export function TextoComEmail({ texto, email, href }: { texto: string; email: string; href: string }) {
  const [antes, ...depois] = texto.split('{email}');
  if (!depois.length) return <>{texto}</>;
  return (
    <>
      {antes}
      <a href={href} className="link break-all font-semibold">
        {email}
      </a>
      {depois.join(email)}
    </>
  );
}
