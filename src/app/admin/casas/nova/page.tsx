import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { FormularioCasa } from '@/components/admin/FormularioCasa';
import { CIDADES } from '@/data/passeios';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { CIDADES_CASA } from '@/lib/casa';

export const dynamic = 'force-dynamic';

export default async function NovaCasa() {
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) redirect('/admin');

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cadastrar casa</h1>
          <p className="text-small text-tinta-suave">Ela fica fora do ar até você publicar. Dá para salvar pela metade e terminar depois.</p>
        </div>
        <a href="/admin/casas" className="min-h-10 bg-white px-4 py-2 font-semibold">
          Voltar às casas
        </a>
      </header>
      <div className="mt-6">
        <FormularioCasa cidades={CIDADES_CASA.map((c) => ({ valor: c, rotulo: CIDADES[c].nome.pt }))} />
      </div>
    </main>
  );
}
