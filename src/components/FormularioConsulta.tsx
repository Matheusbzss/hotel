'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Idioma } from '@/i18n/config';
import type { TextosConsulta } from '@/lib/consulta-textos';
import { emailValido } from '@/lib/validacao';
import { Campo, descricao } from './Campo';

type Erros = Partial<Record<'email' | 'codigo', string>>;

/**
 * O código no formato do site, para conferir antes de enviar, com a mesma tolerância da rota (normalizarCodigo, em
 * src/lib/consulta-pedido.ts): sem diferença de maiúsculas, espaço, hífen ou travessão, e com ou sem o "ON".
 */
const codigoParece = (v: string) => /^((ON|VH)[2-9A-HJ-NP-Z]{6}|[2-9A-HJ-NP-Z]{6})$/.test(v.toUpperCase().replace(/[^A-Z0-9]/g, ''));

/**
 * O formulário de "Consultar meu pedido": o e-mail da compra e o código. A resposta é sempre a mesma ("se os dados
 * conferirem, o link chega no seu e-mail"): a tela nunca diz se o pedido existe, nem de quem é.
 */
export function FormularioConsulta({ idioma, textos: T, emailEmpresa }: { idioma: Idioma; textos: TextosConsulta; emailEmpresa: string }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [isca, setIsca] = useState('');
  const [tentou, setTentou] = useState(false);
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const avisoRef = useRef<HTMLDivElement>(null);

  // o formulário some ao enviar: o aviso precisa ficar na tela, sem ir para baixo do cabeçalho
  useEffect(() => {
    if (enviado) avisoRef.current?.focus();
  }, [enviado]);

  function validar(): Erros {
    const e: Erros = {};
    if (!emailValido(email)) e.email = T.erroEmail;
    if (!codigoParece(codigo)) e.codigo = T.erroCodigo;
    return e;
  }
  const erros: Erros = tentou ? validar() : {};

  async function enviar() {
    setErroGeral('');
    setTentou(true);
    if (Object.keys(validar()).length) return;
    setEnviando(true);
    try {
      const res = await fetch('/api/consultar-pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), codigo: codigo.trim(), idioma, site: isca }),
      });
      if (res.ok) {
        setEnviado(true);
      } else {
        const dados = (await res.json().catch(() => ({}))) as { erro?: string };
        setErroGeral(
          res.status === 429 ? T.erroLimite : dados.erro === 'email' ? T.erroEmail : dados.erro === 'codigo' ? T.erroCodigo : T.erroGeral,
        );
      }
    } catch {
      setErroGeral(T.erroGeral);
    }
    setEnviando(false);
  }

  if (enviado) {
    return (
      <div ref={avisoRef} tabIndex={-1} role="status" className="mt-6 outline-none">
        <p className="text-lead font-semibold">{T.prontoTitulo}</p>
        <p className="mt-2">{T.prontoTexto}</p>
        <p className="mt-4 text-small text-(--tinta-suave)">{T.ajuda.replace('{email}', emailEmpresa)}</p>
        <button
          type="button"
          className="botao botao-vazado mt-6 w-full sm:w-auto"
          onClick={() => {
            setEnviado(false);
            setTentou(false);
            setCodigo('');
          }}
        >
          {T.outraConsulta}
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        enviar();
      }}
      className="relative mt-6 grid gap-5"
    >
      <Campo id={`${id}-email`} rotulo={T.email} erro={erros.email}>
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          className="campo"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={160}
          aria-invalid={Boolean(erros.email)}
          aria-describedby={descricao(`${id}-email`, erros.email)}
          required
        />
      </Campo>
      <Campo id={`${id}-codigo`} rotulo={T.codigo} erro={erros.codigo} ajuda={T.codigoAjuda}>
        <input
          id={`${id}-codigo`}
          className="campo numeros uppercase"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ON-7K3P9Q"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          maxLength={20}
          aria-invalid={Boolean(erros.codigo)}
          aria-describedby={descricao(`${id}-codigo`, erros.codigo, T.codigoAjuda)}
          required
        />
      </Campo>

      {/* campo-isca para robôs: escondido de pessoas (taste-skill-ignore) */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-0 overflow-hidden">
        <label htmlFor={`${id}-site`}>Site</label>
        <input id={`${id}-site`} tabIndex={-1} autoComplete="off" value={isca} onChange={(e) => setIsca(e.target.value)} />
      </div>

      {erroGeral && (
        <p className="bg-erro-claro px-4 py-3 font-semibold text-mar" role="alert">
          {erroGeral}
        </p>
      )}
      <button type="submit" className="botao w-full sm:w-auto" disabled={enviando} aria-busy={enviando}>
        {enviando ? T.enviando : T.botao}
      </button>
    </form>
  );
}
