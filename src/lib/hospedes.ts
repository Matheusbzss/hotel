import { z } from 'zod';
import type { Tables, TablesInsert } from './banco-tipos';
// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { somarDias } from './validacao.ts';

/**
 * O CADASTRO DOS HÓSPEDES DE UMA CASA (Fase 4, Etapa 7): depois do pagamento confirmado, o cliente informa o nome
 * completo e o documento (tipo e número, sem foto) de cada hóspede e, se vier de carro, a placa. É para a portaria e
 * para a segurança da equipe. Fica na tabela casas_hospedes, que só o servidor lê (o painel mostra e copia a lista
 * para a portaria), e é APAGADO DIAS_PARA_APAGAR_HOSPEDES dias depois da saída, ou logo que a estadia é cancelada ou
 * devolvida, pela função apagar_hospedes_vencidos, que o agendamento diário chama (/api/saude). A mesma regra está em
 * cadastroVencido, abaixo. Só a lista dos hóspedes sai: o pedido continua.
 *
 * O formulário (na página do pedido) e a lista do painel são a parte H da Etapa 7; aqui ficam a regra e a tradução
 * entre o formulário e a linha do banco, sem tocar no banco (tests/hospedes.test.ts).
 *
 * ATENÇÃO, antes de o formulário ir ao ar (parte H): a política de privacidade (src/content/legal/) AINDA NÃO fala
 * deste cadastro. Ela tem de dizer, nos idiomas do site, o que se coleta (nome completo, tipo e número do documento de
 * cada hóspede e a placa do carro), para quê (a portaria e a segurança), quem recebe (a portaria do condomínio ou da
 * casa) e por quanto tempo (até 30 dias depois da saída, ou até o cancelamento): LGPD, art. 9º, I, II e V. Hoje ela diz
 * só que os dados das reservas ficam 5 anos.
 */

/** Decisão da pendência 11 (13/11): o cadastro sai 30 dias depois da saída (a política de privacidade ainda vai dizer). */
export const DIAS_PARA_APAGAR_HOSPEDES = 30;

/** Os documentos aceitos (FASE-4: CPF ou RG, DNI, RUT ou passaporte; "outro" para quem não tiver nenhum desses). */
export const TIPOS_DOCUMENTO_HOSPEDE = ['cpf', 'rg', 'dni', 'rut', 'passaporte', 'outro'] as const;
export type TipoDocumentoHospede = (typeof TIPOS_DOCUMENTO_HOSPEDE)[number];

/** O máximo de hóspedes de um cadastro: folga sobre a maior casa (as casas recebem até 14). */
export const MAXIMO_HOSPEDES = 60;

const semEspacoSobrando = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Um hóspede, como vem do formulário. As mesmas travas da tabela casas_hospedes. */
export const EsquemaHospede = z.object({
  nome: z.string().transform(semEspacoSobrando).pipe(z.string().min(3).max(120)),
  documentoTipo: z.enum(TIPOS_DOCUMENTO_HOSPEDE),
  documentoNumero: z
    .string()
    .transform(semEspacoSobrando)
    .pipe(
      z
        .string()
        .min(3)
        .max(30)
        .regex(/^[\p{L}\d .\-/]+$/u),
    ),
  /** A placa do carro em que chega, se vier de carro (basta na linha de quem dirige). */
  placa: z
    .string()
    .transform((s) => s.trim().toUpperCase().replace(/\s+/g, ''))
    .pipe(z.union([z.literal(''), z.string().regex(/^[A-Z\d-]{5,10}$/)]))
    .optional(),
});
export type Hospede = z.infer<typeof EsquemaHospede>;

/** A lista inteira de um cadastro: de 1 a MAXIMO_HOSPEDES hóspedes. */
export const EsquemaHospedes = z.array(EsquemaHospede).min(1).max(MAXIMO_HOSPEDES);

/** O dia em que o cadastro sai do banco: DIAS_PARA_APAGAR_HOSPEDES dias depois da data de saída (AAAA-MM-DD). */
export const apagarHospedesEm = (saida: string) => somarDias(saida, DIAS_PARA_APAGAR_HOSPEDES);

/** Os status (do item ou do pedido) em que a estadia não vai acontecer: o cadastro sai na limpeza seguinte. */
export const STATUS_SEM_ESTADIA: readonly string[] = ['cancelado', 'reembolsado'];

/**
 * O cadastro de uma estadia já pode sair do banco hoje (AAAA-MM-DD, em Búzios)? Sim, 30 dias depois da saída, ou
 * logo que o item ou o pedido é cancelado ou devolvido: a finalidade (a portaria) acabou, e esperar 30 dias depois de
 * uma saída que não vai existir guardaria o documento de todos por quase um ano. É a regra da função do banco
 * apagar_hospedes_vencidos (migração 20261113223000), que é quem apaga de fato.
 */
export function cadastroVencido(estadia: { saida: string; statusItem: string; statusPedido: string }, hoje: string): boolean {
  return (
    apagarHospedesEm(estadia.saida) <= hoje ||
    STATUS_SEM_ESTADIA.includes(estadia.statusItem) ||
    STATUS_SEM_ESTADIA.includes(estadia.statusPedido)
  );
}

/** O hóspede do formulário → a linha da tabela, com a ordem em que aparece na lista. */
export const linhaDeHospede = (itemPedidoId: string, h: Hospede, ordem: number): TablesInsert<'casas_hospedes'> => ({
  item_pedido_id: itemPedidoId,
  ordem,
  nome: h.nome,
  documento_tipo: h.documentoTipo,
  documento_numero: h.documentoNumero,
  placa: h.placa || null,
});

/** A linha da tabela → o hóspede, para o painel e para a lista da portaria. */
export const hospedeDeLinha = (l: Tables<'casas_hospedes'>): Hospede => ({
  nome: l.nome,
  documentoTipo: l.documento_tipo as TipoDocumentoHospede,
  documentoNumero: l.documento_numero,
  ...(l.placa ? { placa: l.placa } : {}),
});
