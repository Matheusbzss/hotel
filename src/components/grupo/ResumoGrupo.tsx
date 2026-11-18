'use client';

import { fmt } from '@/i18n/config';
import { textoPessoas, type RotulosPessoas } from '@/lib/pessoas';
import { formatarDataIso } from '@/lib/validacao';
import { useGrupo } from './GrupoContexto';

/** "Total para 2 adultos + 1 criança · 12 de novembro de 2026" — muda junto com o grupo. */
export function ResumoGrupo({
  textos,
  locale,
  className = '',
}: {
  textos: { totalPara: string; semData: string; rotulos: RotulosPessoas };
  locale: string;
  className?: string;
}) {
  const { grupo } = useGrupo();
  const pessoas = textoPessoas({ adultos: grupo.adultos, criancas: grupo.criancas6a10 + grupo.criancas0a5 }, textos.rotulos);
  const data = grupo.data ? formatarDataIso(grupo.data, locale) : textos.semData;
  return (
    <p className={className} aria-live="polite">
      {fmt(textos.totalPara, { pessoas })} · {data}
    </p>
  );
}
