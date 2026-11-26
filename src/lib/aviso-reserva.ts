/**
 * Os avisos dos cartões de reserva (o do passeio e o do transfer) quando o "Reservar" ou o "Agregar al carrito" não
 * passa. Pacote 34 (26/11, revisão de conversão):
 * - ENT-02: o que falta escolher (a data, o horário ou os dois) também aparece perto do botão tocado, e a tela vai até o
 *   campo. Antes, sem o horário, o aviso aparecia só lá em cima, fora da tela, e o botão parecia não funcionar.
 * - ENT-10: quando o envio falha por conexão, o aviso pede para conferir a internet e tocar de novo. Antes, toda falha
 *   dizia "confira a data e o horário", que estavam certos. Só os erros de data ou de horário falam deles.
 * Funções puras (sem React nem DOM): os testes (tests/aviso-reserva.test.ts) rodam no node puro.
 */

/**
 * Por que o servidor (ou a rede) recusou o item: o `erro` que a rota do carrinho devolve (src/app/api/carrinho/route.ts e
 * conferirEscolha, em src/lib/carrinho-servidor.ts), ou 'rede' quando a resposta nem chegou (src/components/carrinho/
 * CarrinhoContexto.tsx).
 */
export type MotivoDaRecusa = 'conexao' | 'dataHora' | 'antecedencia' | 'cheio' | 'outro';

export function motivoDaRecusa(erro: string | undefined): MotivoDaRecusa {
  // sem resposta (sem internet, o servidor fora do ar, uma página de erro no lugar da resposta): a conexão
  if (!erro || erro === 'rede') return 'conexao';
  if (erro === 'cheio') return 'cheio';
  if (erro === 'antecedencia') return 'antecedencia';
  // a data, o horário e a volta do transfer (que precisa ser depois da ida), também quando vêm pelo caminho do campo
  // ("ida.data", "volta.hora")
  if (erro === 'volta' || /(^|\.)(data|hora)$/.test(erro)) return 'dataHora';
  // o banco fora do ar ('banco'), o limite de itens por IP ('limite') e o que só uma página velha mandaria
  return 'outro';
}

export interface TextosDaRecusa {
  /** "No pudimos conectar. Revisá tu internet y tocá de nuevo." */
  erroConexao: string;
  /** "No se pudo agregar. Revisá la fecha y el horario e intentá de nuevo." (só os erros de data ou de horário) */
  erroAdicionar: string;
  /** "No se pudo agregar ahora. Intentá de nuevo en unos minutos." */
  erroTemporario: string;
  /** "El carrito acepta hasta 12 ítems por pedido." */
  cheio: string;
}

/**
 * A frase do aviso para a recusa. A da antecedência do transfer é montada no cartão (o número de horas vem da regra,
 * src/lib/horarios.ts): quem chama trata 'antecedencia' antes; aqui ela cai na frase da data e do horário.
 */
export function textoDaRecusa(erro: string | undefined, T: TextosDaRecusa): string {
  const motivo = motivoDaRecusa(erro);
  if (motivo === 'conexao') return T.erroConexao;
  if (motivo === 'cheio') return T.cheio;
  if (motivo === 'outro') return T.erroTemporario;
  return T.erroAdicionar;
}

export interface TextosDaFalta {
  /** "Elegí la fecha del paseo, más arriba." */
  faltaData: string;
  /** "Elegí el horario, más arriba." */
  faltaHorario: string;
  /** "Elegí la fecha y el horario, más arriba." */
  faltaDataEHorario: string;
  /** "Para hoy ya no quedan horarios. Elegí otra fecha." */
  semHorarioHoje: string;
}

/**
 * O aviso que se repete perto do botão tocado, no cartão do passeio: o que ainda falta escolher. Vazio quando nada
 * falta. `semHorarioHoje`: a data é hoje, mas os horários de hoje já passaram (a data é que precisa mudar).
 */
export function avisoDaFalta(falta: { data: boolean; horario: boolean; semHorarioHoje?: boolean }, T: TextosDaFalta): string {
  if (falta.data && falta.horario && !falta.semHorarioHoje) return T.faltaDataEHorario;
  if (falta.data) return falta.semHorarioHoje ? T.semHorarioHoje : T.faltaData;
  if (falta.horario) return T.faltaHorario;
  return '';
}
