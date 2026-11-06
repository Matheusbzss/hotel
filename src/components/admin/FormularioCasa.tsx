'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { Lista, Texto } from '@/data/passeios';
import type { DadosCasa } from '@/lib/casa';

const IDIOMAS = [
  ['pt', 'Português'],
  ['es', 'Español'],
  ['en', 'English'],
] as const;

function Secao({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <section className="bg-white p-5">
      <h2 className="text-xl font-bold">{titulo}</h2>
      {ajuda && <p className="mt-1 text-small text-tinta-suave">{ajuda}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function Campo({
  nome,
  rotulo,
  valor,
  ajuda,
  tipo = 'text',
  ...resto
}: {
  nome: string;
  rotulo: string;
  valor?: string | number;
  ajuda?: string;
  tipo?: string;
  min?: number;
  step?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={nome} className="rotulo">
        {rotulo}
      </label>
      <input id={nome} name={nome} type={tipo} defaultValue={valor} className="campo" {...resto} />
      {ajuda && <p className="ajuda">{ajuda}</p>}
    </div>
  );
}

/** Um texto nos três idiomas. */
function Textos({ nome, rotulo, valores, linhas }: { nome: string; rotulo: string; valores?: Texto; linhas?: number }) {
  return (
    <fieldset className="grid gap-3 md:grid-cols-3">
      <legend className="rotulo">{rotulo}</legend>
      {IDIOMAS.map(([idioma, titulo]) => (
        <div key={idioma}>
          <label htmlFor={`${nome}.${idioma}`} className="text-small text-tinta-suave">
            {titulo}
          </label>
          {linhas ? (
            <textarea id={`${nome}.${idioma}`} name={`${nome}.${idioma}`} rows={linhas} defaultValue={valores?.[idioma]} className="campo" />
          ) : (
            <input id={`${nome}.${idioma}`} name={`${nome}.${idioma}`} defaultValue={valores?.[idioma]} className="campo" />
          )}
        </div>
      ))}
    </fieldset>
  );
}

/** Uma lista nos três idiomas: um item por linha. */
function Listas({ nome, rotulo, valores }: { nome: string; rotulo: string; valores?: Lista }) {
  return (
    <fieldset className="grid gap-3 md:grid-cols-3">
      <legend className="rotulo">{rotulo} (um por linha)</legend>
      {IDIOMAS.map(([idioma, titulo]) => (
        <div key={idioma}>
          <label htmlFor={`${nome}.${idioma}`} className="text-small text-tinta-suave">
            {titulo}
          </label>
          <textarea id={`${nome}.${idioma}`} name={`${nome}.${idioma}`} rows={5} defaultValue={valores?.[idioma].join('\n')} className="campo" />
        </div>
      ))}
    </fieldset>
  );
}

/** O cadastro da casa. Só o nome, a cidade, os quartos e a capacidade são obrigatórios para salvar. */
export function FormularioCasa({ casa, cidades }: { casa?: DadosCasa & { id: string }; cidades: { valor: string; rotulo: string }[] }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setAviso(null);
    const resposta = await fetch(casa ? `/api/admin/casas/${casa.id}` : '/api/admin/casas', {
      method: 'POST',
      body: new FormData(e.currentTarget),
    }).catch(() => null);
    const r = (await resposta?.json().catch(() => null)) as { ok: boolean; id?: string; erro?: string } | null;
    setEnviando(false);
    if (!r?.ok) {
      setAviso({ ok: false, texto: r?.erro ?? 'Não deu para salvar. Tente de novo.' });
      return;
    }
    if (!casa) {
      router.push(`/admin/casas/${r.id}?aviso=criada`);
      return;
    }
    setAviso({ ok: true, texto: 'Casa salva.' });
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="grid gap-3">
      <Secao titulo="A casa">
        <Textos nome="nome" rotulo="Nome" valores={casa?.nome} />
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="cidade" className="rotulo">
              Cidade
            </label>
            <select id="cidade" name="cidade" defaultValue={casa?.cidade} className="campo" required>
              {cidades.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>
          <Campo nome="quartos" rotulo="Quartos" tipo="number" min={1} valor={casa?.quartos} required />
          <Campo nome="suites" rotulo="Suítes" tipo="number" min={0} valor={casa?.suites} />
          <Campo nome="banheiros" rotulo="Banheiros" tipo="number" min={0} valor={casa?.banheiros} />
          <Campo nome="capacidade" rotulo="Capacidade (pessoas)" tipo="number" min={1} valor={casa?.capacidade} required />
          {!casa && <Campo nome="slug" rotulo="Endereço da página" placeholder="sai do nome" ajuda="Depois de criado, não muda." />}
        </div>
      </Secao>

      <Secao titulo="Onde fica" ajuda="O endereço exato só aparece no voucher. O ponto do mapa fica perto da casa, como o meio da praia.">
        <Textos nome="local" rotulo="Praia ou bairro" valores={casa?.local} />
        <div className="grid gap-4 md:grid-cols-3">
          <Campo nome="endereco" rotulo="Endereço exato" valor={casa?.endereco} />
          <Campo nome="lat" rotulo="Ponto no mapa: latitude" tipo="number" step="any" valor={casa?.pontoAproximado.lat || ''} />
          <Campo nome="lng" rotulo="Ponto no mapa: longitude" tipo="number" step="any" valor={casa?.pontoAproximado.lng || ''} />
        </div>
      </Secao>

      <Secao titulo="Textos da página" ajuda="Na descrição, deixe uma linha em branco entre os parágrafos.">
        <Textos nome="resumo" rotulo="Resumo" valores={casa?.resumo} linhas={3} />
        <Textos nome="descricao" rotulo="Descrição" valores={casa?.descricao} linhas={8} />
        <Listas nome="camas" rotulo="Camas" valores={casa?.camas} />
        <Listas nome="comodidades" rotulo="Comodidades" valores={casa?.comodidades} />
        <Listas nome="regras" rotulo="Regras da casa" valores={casa?.regras} />
        <Listas nome="cancelamento" rotulo="Regras de cancelamento" valores={casa?.cancelamento} />
      </Secao>

      <Secao titulo="Valores e horários" ajuda="A diária base vale fora das temporadas e dos feriados, que você cadastra depois de salvar a casa.">
        <div className="grid gap-4 md:grid-cols-3">
          <Campo nome="diaria" rotulo="Diária base (R$)" tipo="number" min={0} step="0.01" valor={casa?.diaria} />
          <Campo nome="minimoNoites" rotulo="Mínimo de noites" tipo="number" min={1} valor={casa?.minimoNoites ?? 1} required />
          <Campo nome="taxaLimpeza" rotulo="Taxa de limpeza (R$)" tipo="number" min={0} step="0.01" valor={casa?.taxaLimpeza} />
          <Campo nome="caucao" rotulo="Caução (R$)" tipo="number" min={0} step="0.01" valor={casa?.caucao} />
          <Campo nome="checkIn" rotulo="Check-in" placeholder="15h" valor={casa?.checkIn} />
          <Campo nome="checkOut" rotulo="Check-out" placeholder="11h" valor={casa?.checkOut} />
        </div>
      </Secao>

      <Secao titulo="Fotos" ajuda="Uma por linha, com o caminho da foto no site. A primeira é a capa.">
        <div>
          <label htmlFor="fotos" className="rotulo">
            Fotos
          </label>
          <textarea
            id="fotos"
            name="fotos"
            rows={6}
            defaultValue={casa?.fotos.join('\n')}
            placeholder="/fotos/casas/nome-da-casa/01.jpg"
            className="campo"
          />
        </div>
      </Secao>

      <Secao titulo="Calendário do Airbnb" ajuda="O link de exportação do anúncio. Ele termina em .ics.">
        <Campo nome="icalUrl" rotulo="Link do calendário do Airbnb" tipo="url" valor={casa?.icalUrl} placeholder="https://www.airbnb.com/calendar/ical/..." />
      </Secao>

      <div className="flex flex-wrap items-center gap-4 bg-white p-5">
        <button type="submit" disabled={enviando} className="min-h-11 bg-mar px-6 font-semibold text-white disabled:opacity-60">
          {enviando ? 'Salvando…' : casa ? 'Salvar casa' : 'Cadastrar casa'}
        </button>
        {aviso && (
          <p role={aviso.ok ? 'status' : 'alert'} className={aviso.ok ? 'font-semibold text-sucesso' : 'font-semibold text-erro'}>
            {aviso.texto}
          </p>
        )}
      </div>
    </form>
  );
}
