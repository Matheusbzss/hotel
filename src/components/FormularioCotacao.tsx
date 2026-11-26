'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Idioma } from '@/i18n/config';
import type { TextosCotacao, TipoCotacao, TrajetoCotacao } from '@/lib/cotacao';
import { envioProtegido, semRespostaDaProtecao } from '@/lib/envio-protegido';
import { rastrear } from '@/lib/pixel';
import { respostaDeRobo } from '@/lib/robos';
import { DDIS, PAIS_PADRAO, emailValido, semDdiRepetido, telefoneValido } from '@/lib/validacao';
import { BotaoWhatsAppDoRobo } from './BotaoWhatsAppDoRobo';
import { Campo, descricao } from './Campo';

type Erros = Partial<Record<'nome' | 'email' | 'telefone' | 'mensagem', string>>;

/**
 * O formulário curto dos pedidos de orçamento e das mensagens do site: vai para a tabela cotacoes e aparece no
 * painel. Serve no cartão do transfer, nas casas e no Contato.
 */
export function FormularioCotacao({
  tipo,
  idioma,
  trajeto,
  rotuloMensagem,
  botao,
  telefoneObrigatorio = false,
  mensagemObrigatoria = false,
  mensagemInicial = '',
  textos: T,
}: {
  tipo: TipoCotacao;
  idioma: Idioma;
  /** No transfer, o que o cliente montou no cartão. */
  trajeto?: TrajetoCotacao;
  rotuloMensagem: string;
  botao: string;
  telefoneObrigatorio?: boolean;
  mensagemObrigatoria?: boolean;
  /** A mensagem já começa com isto (o "Avise-me" da página da casa leva a casa, as datas e os hóspedes). */
  mensagemInicial?: string;
  textos: TextosCotacao;
}) {
  const id = useId();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [ddi, setDdi] = useState(PAIS_PADRAO[idioma].ddi);
  const [telefone, setTelefone] = useState('');
  const [mensagem, setMensagem] = useState(mensagemInicial);
  const [isca, setIsca] = useState('');
  const [tentou, setTentou] = useState(false);
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const avisoRef = useRef<HTMLDivElement>(null);

  // o formulário some ao enviar: o aviso precisa ficar na tela, sem ir para baixo do cabeçalho
  useEffect(() => {
    if (enviado) avisoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [enviado]);

  function validar(): Erros {
    const e: Erros = {};
    if (nome.trim().length < 3) e.nome = T.erroObrigatorio;
    if (!emailValido(email)) e.email = T.erroEmail;
    if ((telefoneObrigatorio || telefone.trim()) && !telefoneValido(ddi, telefone)) e.telefone = T.erroTelefone;
    if (mensagemObrigatoria && mensagem.trim().length < 3) e.mensagem = T.erroObrigatorio;
    return e;
  }
  const erros: Erros = tentou ? validar() : {};

  async function enviar() {
    setErroGeral('');
    setTentou(true);
    if (Object.keys(validar()).length) return;
    setEnviando(true);
    try {
      const res = await envioProtegido('/api/cotacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          idioma,
          nome: nome.trim(),
          email: email.trim(),
          ...(telefone.trim() ? { ddi, telefone } : {}),
          mensagem: mensagem.trim(),
          ...(trajeto ? { trajeto } : {}),
          site: isca,
        }),
      });
      if (res.ok) {
        rastrear('Contact');
        setEnviado(true);
        return;
      }
      // confundido com robô pela proteção (403 'robo'): a mensagem própria, no lugar do erro de sempre
      setErroGeral(respostaDeRobo(res.status, await res.json().catch(() => null)) ? T.erroRobo : T.erro);
    } catch (e) {
      // a proteção contra robôs não respondeu (src/lib/envio-protegido.ts): o mesmo que o 403 'robo' mostra
      setErroGeral(semRespostaDaProtecao(e) ? T.erroRobo : T.erro);
    }
    setEnviando(false);
  }

  if (enviado) {
    return (
      <div ref={avisoRef} role="status" className="mt-4">
        <p className="font-semibold">{T.sucessoTitulo}</p>
        <p className="mt-1">{T.sucessoTexto}</p>
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
      className="relative mt-4 grid gap-4"
    >
      <Campo id={`${id}-nome`} rotulo={T.nome} erro={erros.nome}>
        <input
          id={`${id}-nome`}
          className="campo"
          autoComplete="name"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          aria-invalid={Boolean(erros.nome)}
          aria-describedby={descricao(`${id}-nome`, erros.nome)}
          required
        />
      </Campo>
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
      <div>
        <span className="rotulo" id={`${id}-telefone-rotulo`}>
          {telefoneObrigatorio ? T.telefone : T.telefoneOpcional}
        </span>
        {/* A linha pode quebrar: o telefone desce para a linha de baixo do país só quando os dois não cabem lado a lado
            (o mínimo de 8.5rem é o que deixa "21 99999-9999" inteiro; menos que 8.4rem corta o número). Este formulário
            fica dentro de um cartão, mais estreito que o checkout: em 360 e 390 px com a letra normal nada muda; em
            320 px, e com a letra grande, o número ficava cortado (o mesmo conserto do telefone do checkout, Pacote 19). */}
        <div className="flex flex-wrap gap-2">
          <label htmlFor={`${id}-ddi`} className="sr-only">
            {T.ddi}
          </label>
          <select
            id={`${id}-ddi`}
            className="campo w-[7.5rem] shrink-0"
            value={ddi}
            onChange={(e) => setDdi(e.target.value)}
            autoComplete="tel-country-code"
          >
            {DDIS.map((o) => (
              <option key={o.ddi + o.pais} value={o.ddi}>
                {o.pais} +{o.ddi}
              </option>
            ))}
          </select>
          <input
            id={`${id}-telefone`}
            type="tel"
            inputMode="tel"
            className="campo min-w-[8.5rem] flex-1"
            autoComplete="tel-national"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            // Pacote 34 (P5): o código do país repetido no começo sai do número, e um de outro país, escrito com o "+", passa
            // para a caixa (semDdiRepetido, src/lib/validacao.ts; o servidor faz a mesma conta)
            onBlur={() => {
              const t = semDdiRepetido(ddi, telefone);
              if (t.ddi !== ddi) setDdi(t.ddi);
              if (t.numero !== telefone) setTelefone(t.numero);
            }}
            maxLength={24}
            aria-labelledby={`${id}-telefone-rotulo`}
            aria-invalid={Boolean(erros.telefone)}
            aria-describedby={erros.telefone ? `${id}-telefone-erro` : undefined}
            required={telefoneObrigatorio}
          />
        </div>
        {erros.telefone && (
          <span id={`${id}-telefone-erro`} className="erro-campo" role="alert">
            {erros.telefone}
          </span>
        )}
      </div>
      <Campo id={`${id}-mensagem`} rotulo={rotuloMensagem} erro={erros.mensagem}>
        <textarea
          id={`${id}-mensagem`}
          className="campo min-h-24"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          maxLength={1000}
          aria-invalid={Boolean(erros.mensagem)}
          aria-describedby={descricao(`${id}-mensagem`, erros.mensagem)}
          required={mensagemObrigatoria}
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
      {/* o WhatsApp da equipe só com a mensagem do robô (a exceção à regra de só depois do pagamento) */}
      {erroGeral === T.erroRobo && <BotaoWhatsAppDoRobo whatsapp={T.erroRoboWhatsapp} />}
      <button type="submit" className="botao w-full" disabled={enviando} aria-busy={enviando}>
        {enviando ? T.enviando : botao}
      </button>
    </form>
  );
}
