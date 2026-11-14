/**
 * AS DUAS CASAS PRONTAS PARA CADASTRAR (Fase 4, Etapa 7, parte J), DESLIGADAS. Quem grava no banco é
 * scripts/cadastrar-casas.ts (depois da migração 20261113223000); quem copia as fotos é scripts/preparar-fotos-casas.ts.
 *
 * De onde vem cada dado (nada inventado):
 * - material-recebido/FASE-4.md (Etapa 7, versão de 10/11) e os DADOS.md das duas casas (dono, 06 e 07/11);
 * - as decisões recomendadas de material-recebido/ETAPA-7-PLANO-DAS-CASAS.md (13/11): fim de semana junto, bloqueio
 *   único da Ferradura até 06/12, pacotes de feriado da véspera ao primeiro dia útil (seção 5), sábado 02 e domingo
 *   03/01 no preço de fim de semana, cancelamento (pendência 3, o dono confirma antes de publicar a política);
 * - as fotos: o que aparece claramente nelas entra com veioDaFoto (o dono autorizou em 07/11 e confere antes de ligar).
 * O que o dono ainda não disse fica de fora (Wi-Fi, vagas e fumar na Ferradura; câmeras nas duas; qual quarto da
 * Ferradura é suíte; distância exata até a areia; nome da praia a 5 minutos; TV na sala da Geribá).
 *
 * Os textos do cliente são neutros (sem "tú" nem "vos"), então servem às duas versões do espanhol. Onde uma palavra
 * muda na Argentina (hamaca paraguaya, lavarropas, heladera...), o texto leva a versão 'es-ar', como nas listas fixas
 * de src/data/comodidades.ts e nos textos alternativos das fotos. tests/casas-cadastro.test.ts confere as contas, as
 * datas, as fotos e as palavras proibidas; tests/es-ar.test.ts, o espanhol das duas versões.
 */
import type { CidadeCasa } from '../../src/data/casas';
import type { Lista, Texto } from '../../src/data/passeios';
import { CAMAS, COMODIDADES, REGRAS_EVENTO, REGRAS_FUMAR } from '../../src/data/comodidades.ts';
import type { TablesInsert } from '../../src/lib/banco-tipos.ts';
import {
  colunasDosDetalhes,
  type ComodidadeMarcada,
  type Destaque,
  type Quarto,
  type RegrasProprias,
} from '../../src/lib/casa-detalhes.ts';
import type { Pacote } from '../../src/lib/estadia.ts';
import { CANCELAMENTO_DAS_CASAS, regrasDeTodasAsCasas } from '../../src/data/regras-casas.ts';

// as regras de todas as casas e o cancelamento moram em src/data/regras-casas.ts (a página da casa usa as mesmas frases)
export { CANCELAMENTO_DAS_CASAS, regrasDeTodasAsCasas };

/** Um retângulo da foto recebida, em pixels dela: x e y do canto de cima à esquerda, largura e altura. */
export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/** Uma foto recebida (nome do arquivo em material-recebido/casas/<pasta>/fotos) e o nome neutro no site. */
export interface FotoParaCopiar {
  origem: string;
  arquivo: string;
  /** Pedaços borrados (com a borda esfumada) antes de tudo: uma pessoa que aparece, por exemplo. */
  desfocar?: Retangulo[];
  /** O recorte da foto, depois do borrão: tira da foto o que não pode aparecer (vizinhos, por exemplo). */
  recorte?: Retangulo;
  /** Por que a foto foi borrada ou recortada (fica no código e em docs/CREDITOS.md, não vai para o site). */
  motivoDaEdicao?: string;
}

export interface CasaParaCadastrar {
  slug: string;
  /** A pasta em material-recebido/casas. */
  pasta: string;
  cidade: CidadeCasa;
  nome: Texto;
  /** O bairro, que aparece antes da reserva. */
  local: Texto;
  /** A descrição curta (3 a 4 linhas, antes do "ler mais"). */
  resumo: Texto;
  /** A descrição longa: parágrafos separados por linha em branco. */
  descricao: Texto;
  textoBairro: Texto;
  quartos: number;
  suites: number;
  /** Banheiros inteiros; o lavabo (meio banheiro) fica em lavabos. */
  banheiros: number;
  lavabos: number;
  /** Até quantos hóspedes: os lugares nas camas (regra do dono, 07/11). */
  capacidade: number;
  quartosDetalhe: Quarto[];
  comodidadesMarcadas: ComodidadeMarcada[];
  destaques: Destaque[];
  regrasProprias: RegrasProprias;
  /** Diárias em centavos: semana, noites de sábado e domingo, feriado e Réveillon. */
  diariaCentavos: number;
  diariaFimDeSemanaCentavos: number;
  diariaFeriadoCentavos: number;
  diariaReveillonCentavos: number;
  minimoNoites: number;
  fimDeSemanaJunto: boolean;
  pacotes: Pacote[];
  /** Bloqueios à mão iniciais (fim = dia da entrada liberada). */
  bloqueios: { inicio: string; fim: string; referencia: string }[];
  /** As fotos na ordem de capa. */
  fotos: FotoParaCopiar[];
  /** As fotos recebidas que ficaram de fora, com o motivo. */
  fotosDeFora: { origem: string; motivo: string }[];
}

const mesmo = (s: string): Texto => ({ pt: s, es: s, en: s });

/* ------------------------------------------------------------------ */
/* Pacotes de feriado de 14/11/2026 a 13/11/2027                        */

/**
 * Os pacotes do ano (seção 5 do plano): da véspera do primeiro dia de folga ao primeiro dia útil depois, só feriados
 * nacionais e Carnaval, com todas as diárias no preço de feriado; o Réveillon nas duas opções do dono (4 ou 5
 * diárias, no preço de Réveillon). Sem pacote em 15/11 e 20/11/2026 (casas bloqueadas) nem em 01/05/2027 (sábado).
 * Corpus Christi (estadual) fica para o dono decidir; São Jorge, Sant'Ana e o aniversário de Búzios estão fora da
 * regra do dono. O dono confere a lista antes de ligar as casas.
 */
export function pacotesDoAno(feriadoCentavos: number, reveillonCentavos: number): Pacote[] {
  const p = (nome: Texto, entrada: string, saida: string, diariaCentavos = feriadoCentavos, grupo?: string): Pacote => ({
    nome,
    entrada,
    saida,
    diariaCentavos,
    ...(grupo ? { grupo } : {}),
  });
  const reveillon = { pt: 'Pacote Réveillon', es: 'Paquete Año Nuevo', en: "New Year's Eve Package" };
  return [
    p({ pt: 'Pacote Natal', es: 'Paquete Navidad', en: 'Christmas Package' }, '2026-12-24', '2026-12-28'),
    p(reveillon, '2026-12-28', '2027-01-02', reveillonCentavos, 'reveillon-2026'),
    p(reveillon, '2026-12-29', '2027-01-02', reveillonCentavos, 'reveillon-2026'),
    p({ pt: 'Pacote Carnaval', es: 'Paquete Carnaval', en: 'Carnival Package' }, '2027-02-05', '2027-02-10'),
    p({ pt: 'Pacote Semana Santa', es: 'Paquete Semana Santa', en: 'Easter Package' }, '2027-03-25', '2027-03-29'),
    p({ pt: 'Pacote Tiradentes', es: 'Paquete Tiradentes', en: 'Tiradentes Day Package' }, '2027-04-20', '2027-04-22'),
    p({ pt: 'Pacote Independência', es: 'Paquete Independencia', en: 'Independence Day Package' }, '2027-09-03', '2027-09-08'),
    p({ pt: 'Pacote Aparecida', es: 'Paquete Aparecida', en: 'Aparecida Day Package' }, '2027-10-08', '2027-10-13'),
    p({ pt: 'Pacote Finados', es: 'Paquete Día de los Difuntos', en: "All Souls' Day Package" }, '2027-10-29', '2027-11-03'),
    p(
      { pt: 'Pacote Proclamação da República', es: 'Paquete Proclamación de la República', en: 'Republic Day Package' },
      '2027-11-12',
      '2027-11-16',
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Mansão Ferradura Vista Mar                                          */

const ferradura: CasaParaCadastrar = {
  slug: 'mansao-ferradura-vista-mar',
  pasta: 'casa-ferradurinha',
  cidade: 'buzios',
  nome: mesmo('Mansão Ferradura Vista Mar'),
  local: mesmo('Ferradurinha'),
  // o resumo serve ao Google e à prévia do link; a página mostra só a descrição, que não repete o que os destaques, a
  // ficha e as comodidades já dizem (o jeito da casa, das fotos que o dono autorizou), e nenhum dos dois repete a frase
  // do anúncio ("Casa nova, design moderno, vista para o mar")
  resumo: {
    pt: 'No bairro da Ferradurinha, em Búzios, esta casa nova, de design moderno, tem vista para o mar. Recebe até 12 hóspedes em 4 quartos (3 suítes), com piscina, spa, cozinha externa e churrasqueira. A praia fica a cerca de 5 minutos a pé.',
    es: 'En el barrio de Ferradurinha, en Búzios, esta casa nueva, de diseño moderno, tiene vista al mar. Recibe hasta 12 huéspedes en 4 habitaciones (3 en suite), con piscina, spa, cocina exterior y parrilla. La playa queda a unos 5 minutos a pie.',
    en: 'In the Ferradurinha neighborhood of Búzios, this new, modern home has a sea view. It sleeps up to 12 guests in 4 bedrooms (3 en-suite), with a pool, a spa, an outdoor kitchen and a barbecue grill. The beach is about a 5-minute walk away.',
  },
  // das fotos 03, 11, 12, 14, 17 e 20 (o dono autorizou completar com o que aparece nelas) e do DADOS.md (3 suítes)
  descricao: {
    pt: 'De design moderno, a casa tem sala e cozinha integradas, com teto de madeira e portas de vidro que se abrem para a piscina. Há também uma sala de TV, um jardim interno e um parquinho para as crianças.\n\nDos 4 quartos, 3 são suítes. A piscina não tem aquecimento.',
    es: 'De diseño moderno, la casa tiene sala y cocina integradas, con techo de madera y puertas de vidrio que se abren a la piscina. También hay una sala de TV, un jardín interior y un área de juegos infantiles.\n\nDe las 4 habitaciones, 3 son en suite. La piscina no es climatizada.',
    en: 'With a modern design, the house has an open-plan living room and kitchen, with wooden ceilings and glass doors that open onto the pool. There is also a TV room, an indoor garden and a playground for the kids.\n\nThree of the 4 bedrooms are en-suite. The pool is not heated.',
  },
  // seção 6 do plano (guias de viagem lidos em 13/11), em 3 frases curtas: mostrar ao dono antes de publicar
  textoBairro: {
    pt: 'A Ferradurinha fica ao lado de Geribá, uma das praias mais movimentadas de Búzios. A praia do bairro é pequena, protegida por um paredão de pedras, e tem mar muito calmo, bom para caiaque e stand up paddle. O centro e a Rua das Pedras ficam a cerca de 4,5 km.',
    es: 'Ferradurinha está al lado de Geribá, una de las playas más concurridas de Búzios. La playa del barrio es pequeña, está protegida por un paredón de piedras y tiene el mar muy calmo, bueno para kayak y stand up paddle. El centro y la Rua das Pedras quedan a unos 4,5 km.',
    en: 'Ferradurinha sits next to Geribá, one of the busiest beaches in Búzios. The neighborhood’s small beach is sheltered by a rock wall and has very calm water, good for kayaking and stand-up paddleboarding. The town center and Rua das Pedras are about 4.5 km away.',
  },
  quartos: 4,
  suites: 3,
  banheiros: 3,
  lavabos: 1,
  capacidade: 12,
  // o dono ainda não disse quais 3 quartos são suítes: nenhum quarto marca banheiro (vale o "3 suítes" do total)
  quartosDetalhe: [
    {
      nome: { pt: 'Quarto 1', es: 'Habitación 1', en: 'Bedroom 1' },
      camas: [{ tipo: 'king', quantidade: 1 }],
      banheiro: null,
      foto: '/fotos/casas/mansao-ferradura-vista-mar/quarto-1-vista-mar.jpg',
      detalhe: { pt: 'Vista para o mar', es: 'Vista al mar', en: 'Sea view' },
    },
    {
      nome: { pt: 'Quarto 2', es: 'Habitación 2', en: 'Bedroom 2' },
      camas: [{ tipo: 'king', quantidade: 1 }],
      banheiro: null,
      foto: '/fotos/casas/mansao-ferradura-vista-mar/quarto-2.jpg',
    },
    {
      nome: { pt: 'Quarto 3', es: 'Habitación 3', en: 'Bedroom 3' },
      camas: [{ tipo: 'king', quantidade: 1 }],
      banheiro: null,
      foto: '/fotos/casas/mansao-ferradura-vista-mar/quarto-3.jpg',
    },
    {
      nome: { pt: 'Quarto 4', es: 'Habitación 4', en: 'Bedroom 4' },
      camas: [
        { tipo: 'queen', quantidade: 1 },
        { tipo: 'beliche', quantidade: 2 },
      ],
      banheiro: null,
      foto: '/fotos/casas/mansao-ferradura-vista-mar/quarto-4-cama-e-beliches.jpg',
    },
  ],
  // as 10 primeiras aparecem antes do "ver tudo": primeiro o que os destaques e a descrição ainda não disseram (o ar, a
  // roupa de cama, a cozinha, as TVs e o som), a vista por último
  comodidadesMarcadas: [
    { id: 'ar-condicionado', veioDaFoto: false },
    { id: 'roupa-de-cama', veioDaFoto: false },
    { id: 'cozinha-completa', veioDaFoto: false },
    { id: 'tv-4k', veioDaFoto: false },
    { id: 'som-sonos', veioDaFoto: false },
    { id: 'lavanderia', veioDaFoto: true },
    { id: 'varandas', veioDaFoto: true },
    { id: 'espreguicadeiras', veioDaFoto: true },
    { id: 'piscina-borda-infinita', veioDaFoto: true },
    { id: 'vista-mar', veioDaFoto: false },
    { id: 'piscina', veioDaFoto: false },
    { id: 'spa', veioDaFoto: false },
    { id: 'cozinha-externa', veioDaFoto: false },
    { id: 'churrasqueira', veioDaFoto: false },
    { id: 'tv-quartos', veioDaFoto: true },
    { id: 'ilha-cozinha', veioDaFoto: true },
    { id: 'adega', veioDaFoto: true },
    { id: 'mesa-jantar', veioDaFoto: true },
    { id: 'chuveiro-teto', veioDaFoto: true },
    { id: 'espaco-trabalho', veioDaFoto: true },
    { id: 'ventilador-teto', veioDaFoto: true },
    { id: 'jardim', veioDaFoto: true },
    { id: 'jardim-interno', veioDaFoto: true },
    { id: 'parquinho', veioDaFoto: true },
  ],
  destaques: [
    {
      icone: 'vista-mar',
      texto: { pt: 'Casa nova, com vista para o mar', es: 'Casa nueva, con vista al mar', en: 'New home with a sea view' },
    },
    {
      icone: 'piscina',
      texto: { pt: 'Piscina com vista para o mar e spa', es: 'Piscina con vista al mar y spa', en: 'Pool with a sea view, plus a spa' },
    },
    {
      icone: 'praia',
      texto: {
        pt: 'A cerca de 5 minutos a pé da praia e das trilhas',
        es: 'A unos 5 minutos a pie de la playa y de los senderos',
        en: 'About a 5-minute walk to the beach and the trails',
      },
    },
    {
      icone: 'churrasqueira',
      texto: { pt: 'Cozinha externa e churrasqueira', es: 'Cocina exterior y parrilla', en: 'Outdoor kitchen and barbecue grill' },
    },
  ],
  regrasProprias: {
    evento: 'so-feriados',
    fumar: null,
    // a foto 32 mostra a escada interna; sem dizer se serve para idoso ou criança pequena
    escadas: { texto: { pt: 'Casa com escada', es: 'Casa con escalera', en: 'The house has stairs' }, veioDaFoto: true },
    cameras: null,
  },
  diariaCentavos: 100000,
  diariaFimDeSemanaCentavos: 130000,
  diariaFeriadoCentavos: 150000,
  diariaReveillonCentavos: 200000,
  minimoNoites: 2,
  fimDeSemanaJunto: true,
  pacotes: pacotesDoAno(150000, 200000),
  bloqueios: [{ inicio: '2026-11-06', fim: '2026-12-07', referencia: 'Bloqueio inicial do dono do imóvel (noites até 06/12/2026)' }],
  fotos: [
    { origem: '01-piscina-infinita-vista-mar.jpg', arquivo: 'piscina-vista-mar.jpg' },
    { origem: '03-sala-vista-mar.jpg', arquivo: 'sala-de-estar-teto-de-madeira.jpg' },
    { origem: '21-quarto-vista-mar-2.jpg', arquivo: 'quarto-1-vista-mar.jpg' },
    { origem: '04-jantar-vista-mar.jpg', arquivo: 'mesa-de-jantar-vista-mar.jpg' },
    { origem: '05-cozinha-pia-vista-piscina.jpg', arquivo: 'cozinha-pia-e-vista.jpg' },
    { origem: '06-terraco-espreguicadeiras-piscina.jpg', arquivo: 'espreguicadeiras-na-piscina.jpg' },
    { origem: '07-varanda-vista-mar.jpg', arquivo: 'varanda-envidracada.jpg' },
    { origem: '08-quarto-vista-mar.jpg', arquivo: 'cama-de-frente-para-a-janela.jpg' },
    { origem: '09-cozinha-ilha-bancos.jpg', arquivo: 'cozinha-ilha-com-bancos.jpg' },
    { origem: '10-cozinha.jpg', arquivo: 'cozinha-completa.jpg' },
    { origem: '11-sala-e-cozinha.jpg', arquivo: 'sala-e-cozinha-integradas.jpg' },
    { origem: '12-sala-tv.jpg', arquivo: 'sala-de-tv.jpg' },
    { origem: '13-spa-portas-de-vidro.jpg', arquivo: 'spa.jpg' },
    { origem: '14-fachada-piscina-portas.jpg', arquivo: 'portas-de-vidro-e-piscina.jpg' },
    { origem: '15-varanda-poltronas-piscina.jpg', arquivo: 'varanda-poltronas.jpg' },
    { origem: '16-borda-piscina-vista-mar.jpg', arquivo: 'borda-da-piscina.jpg' },
    { origem: '17-jardim-interno.jpg', arquivo: 'jardim-interno.jpg' },
    // o reflexo do fotógrafo no vidro do hall fica: não dá para reconhecer ninguém (docs/CREDITOS.md)
    { origem: '18-porta-de-entrada.jpg', arquivo: 'porta-de-entrada.jpg' },
    {
      origem: '19-fachada-entrada-jardim.jpg',
      arquivo: 'fachada-e-jardim.jpg',
      recorte: { x: 104, y: 116, largura: 616, altura: 424 },
      motivoDaEdicao:
        'recortada pelo mesmo critério da 36: sai o sobrado vizinho com varandas (no alto, à direita) e a casa vizinha de telhado vermelho (à esquerda); ficam a fachada, a porta e o caminho de pedras',
    },
    { origem: '20-playground.jpg', arquivo: 'parquinho.jpg' },
    { origem: '22-quarto-teto-madeira-janela.jpg', arquivo: 'quarto-teto-de-madeira.jpg' },
    { origem: '23-quarto-janela-verde.jpg', arquivo: 'quarto-3.jpg' },
    { origem: '24-quarto-teto-branco.jpg', arquivo: 'quarto-2.jpg' },
    { origem: '25-quarto-casal-e-beliches.jpg', arquivo: 'quarto-4-cama-e-beliches.jpg' },
    { origem: '26-quarto-casal-e-beliches-tv.jpg', arquivo: 'quarto-4-tv.jpg' },
    { origem: '27-banheiro-chuveiro-teto-vista.jpg', arquivo: 'banheiro-chuveiro-de-teto.jpg' },
    { origem: '28-banheiro-espelho-redondo.jpg', arquivo: 'banheiro-espelho-redondo.jpg' },
    { origem: '29-lavabo.jpg', arquivo: 'lavabo.jpg' },
    { origem: '30-sala-sofa-cozinha.jpg', arquivo: 'sofa-e-cozinha.jpg' },
    { origem: '31-cozinha-bar-sala-tv.jpg', arquivo: 'cozinha-e-sala-de-tv.jpg' },
    { origem: '32-jantar-mesa-grande-escada.jpg', arquivo: 'mesa-grande-e-escada.jpg' },
    {
      origem: '33-corredor-vidro-sala.jpg',
      arquivo: 'corredor-de-vidro.jpg',
      desfocar: [{ x: 126, y: 246, largura: 36, altura: 70 }],
      motivoDaEdicao: 'borrada: uma pessoa de pé na beira da piscina, vista pela porta de vidro (sem autorização de imagem)',
    },
    { origem: '35-entrada-porta-madeira.jpg', arquivo: 'entrada-e-jardim.jpg' },
    { origem: '37-lavanderia.jpg', arquivo: 'lavanderia.jpg' },
  ],
  fotosDeFora: [
    {
      origem: '02-vista-aerea.jpg',
      motivo:
        'por cautela, até o dono dizer: a casa vista de cima (telhado com painéis solares, piscina e jardim); junto com o círculo do mapa, ajuda a achar a casa na foto de satélite',
    },
    { origem: '34-vista-aerea-frente-portao.jpg', motivo: 'vista aérea da frente: mostra o portão e a rua (ajuda a achar a casa)' },
    { origem: '36-jardim-frente-portao.jpg', motivo: 'por cautela: o portão, as casas vizinhas e uma torre de antena' },
    { origem: '38-decoracao-prateleiras.jpg', motivo: 'só decoração (fraca para o site, nota do DADOS.md)' },
  ],
};

/* ------------------------------------------------------------------ */
/* Mansão Geribá Vista Mar                                             */

const geriba: CasaParaCadastrar = {
  slug: 'mansao-geriba-vista-mar',
  pasta: 'casa-geriba',
  cidade: 'buzios',
  nome: mesmo('Mansão Geribá Vista Mar'),
  local: mesmo('Geribá'),
  resumo: {
    pt: 'Casa em condomínio fechado com vigilância 24 horas, a poucos metros da praia de Geribá, em Búzios. Recebe até 14 hóspedes em 5 suítes e tem piscina privativa com vista para o mar, área de churrasco e espaços ao ar livre com vista.',
    es: 'Casa en un condominio cerrado con vigilancia las 24 horas, a pocos metros de la playa de Geribá, en Búzios. Recibe hasta 14 huéspedes en 5 habitaciones en suite y tiene piscina privada con vista al mar, área de parrilla y espacios al aire libre con vista.',
    en: 'A home in a gated community with 24-hour security, just a few meters from Geribá Beach in Búzios. It sleeps up to 14 guests in 5 en-suite bedrooms and has a private pool with a sea view, a barbecue area and outdoor spaces with a view.',
  },
  // como na Ferradura: a descrição não repete os destaques, a ficha nem as comodidades. "Boa para grupos e famílias" é
  // do anúncio (DADOS.md); o lounge e o deck ao lado da piscina, das fotos 01, 02, 08 e 16
  descricao: {
    pt: 'Casa em 3 andares (triplex), boa para grupos e famílias. A sala de estar tem 3 sofás, e o lounge envidraçado e o deck de madeira com puffs ficam ao lado da piscina.\n\nOs 5 quartos são suítes, e há mais um banheiro social. A piscina não tem aquecimento.',
    es: 'Casa de 3 pisos (tríplex), buena para grupos y familias. La sala de estar tiene 3 sofás, y el lounge con paredes de vidrio y el deck de madera con puffs están junto a la piscina.\n\nLas 5 habitaciones son en suite, y hay un baño más. La piscina no es climatizada.',
    en: 'A three-story home (triplex), good for groups and families. The living room has 3 sofas, and the glass-walled lounge and the wooden deck with bean bags sit beside the pool.\n\nAll 5 bedrooms are en-suite, and there is a guest bathroom. The pool is not heated.',
  },
  // fatos do DADOS.md (guias de viagem de 07/11, com fonte), sem superlativo: mostrar ao dono antes de publicar
  textoBairro: {
    pt: 'Geribá é uma das praias mais movimentadas de Búzios, com cerca de 2 km de areia e quiosques ao longo da orla. As ondas, mais fortes no meio da praia, são boas para surfe. O centro e a Rua das Pedras ficam a cerca de 5 a 10 minutos de carro. Perto ficam as praias da Ferradurinha e de Tucuns.',
    es: 'Geribá es una de las playas más concurridas de Búzios, con cerca de 2 km de arena y quioscos a lo largo de la costa. Las olas, más fuertes en el centro de la playa, son buenas para surfear. El centro y la Rua das Pedras están a unos 5 a 10 minutos en auto. Cerca están las playas de Ferradurinha y Tucuns.',
    en: 'Geribá is one of the busiest beaches in Búzios, with about 2 km of sand and beach kiosks along the shore. The waves, stronger in the middle of the beach, are good for surfing. The town center and Rua das Pedras are about a 5 to 10-minute drive away. The Ferradurinha and Tucuns beaches are nearby.',
  },
  quartos: 5,
  suites: 5,
  banheiros: 6,
  lavabos: 0,
  capacidade: 14,
  // as 5 são suítes; só o quarto 5 tem foto (os outros cartões ficam com o ícone de cama até as fotos chegarem)
  quartosDetalhe: [
    { nome: { pt: 'Quarto 1', es: 'Habitación 1', en: 'Bedroom 1' }, camas: [{ tipo: 'king', quantidade: 1 }], banheiro: true },
    { nome: { pt: 'Quarto 2', es: 'Habitación 2', en: 'Bedroom 2' }, camas: [{ tipo: 'queen', quantidade: 1 }], banheiro: true },
    {
      nome: { pt: 'Quarto 3', es: 'Habitación 3', en: 'Bedroom 3' },
      camas: [
        { tipo: 'casal', quantidade: 1 },
        { tipo: 'solteiro', quantidade: 1 },
      ],
      banheiro: true,
    },
    { nome: { pt: 'Quarto 4', es: 'Habitación 4', en: 'Bedroom 4' }, camas: [{ tipo: 'solteiro', quantidade: 3 }], banheiro: true },
    {
      nome: { pt: 'Quarto 5', es: 'Habitación 5', en: 'Bedroom 5' },
      camas: [{ tipo: 'casal', quantidade: 2 }],
      banheiro: true,
      foto: '/fotos/casas/mansao-geriba-vista-mar/quarto-5.jpg',
    },
  ],
  // as 10 primeiras: primeiro o que os destaques e a descrição ainda não disseram (o ar, o Wi-Fi, o estacionamento, a
  // roupa de cama), a vista por último
  comodidadesMarcadas: [
    { id: 'ar-condicionado', veioDaFoto: false },
    { id: 'wifi', veioDaFoto: false },
    {
      id: 'estacionamento',
      veioDaFoto: false,
      detalhe: {
        pt: '4 vagas na garagem do condomínio',
        es: '4 lugares en el garaje del condominio',
        en: '4 spaces in the community garage',
      },
    },
    { id: 'roupa-de-cama', veioDaFoto: false },
    { id: 'cozinha-completa', veioDaFoto: false },
    { id: 'churrasqueira', veioDaFoto: false },
    { id: 'bar-externo', veioDaFoto: true },
    { id: 'braseiro', veioDaFoto: true },
    { id: 'piscina-prainha', veioDaFoto: true },
    { id: 'vista-mar', veioDaFoto: false },
    { id: 'piscina', veioDaFoto: false },
    {
      id: 'acesso-praia-escada',
      veioDaFoto: false,
      detalhe: { pt: 'Também se chega pela rua', es: 'También se llega por la calle', en: 'Also reachable by the street' },
    },
    { id: 'condominio-vigilancia', veioDaFoto: false },
    { id: 'area-estar-externa', veioDaFoto: false },
    { id: 'sala-de-estar', veioDaFoto: false, detalhe: { pt: 'Com 3 sofás', es: 'Con 3 sofás', en: 'With 3 sofas' } },
    { id: 'lounge-envidracado', veioDaFoto: true },
    { id: 'deck', veioDaFoto: true },
    { id: 'espreguicadeiras', veioDaFoto: true },
    { id: 'mesas-externas', veioDaFoto: true },
    { id: 'varandas', veioDaFoto: true },
    { id: 'jardim', veioDaFoto: true },
    { id: 'rede', veioDaFoto: true },
    // sem 'tv-sala': a única foto da sala (a 37, tirada de fora, pelo vidro) mostra um abajur, não uma TV. Volta só se o
    // dono confirmar que a sala tem TV
    {
      id: 'espaco-trabalho',
      veioDaFoto: true,
      detalhe: { pt: 'Escrivaninha com vista para o mar', es: 'Escritorio con vista al mar', en: 'Desk with a sea view' },
    },
    { id: 'chuveiro-teto', veioDaFoto: true },
    { id: 'pia-dupla', veioDaFoto: true },
    { id: 'bide', veioDaFoto: true },
  ],
  // os quatro do exemplo do dono (FASE-4, Etapa 7, parte 3 da página)
  destaques: [
    {
      icone: 'piscina',
      texto: { pt: 'Piscina privativa com vista para o mar', es: 'Piscina privada con vista al mar', en: 'Private pool with a sea view' },
    },
    {
      icone: 'seguranca',
      texto: {
        pt: 'Condomínio fechado com vigilância 24 horas',
        es: 'Condominio cerrado con vigilancia las 24 horas',
        en: 'Gated community with 24-hour security',
      },
    },
    {
      icone: 'escada',
      texto: {
        pt: 'Acesso à praia por escada do condomínio',
        es: 'Acceso a la playa por una escalera del condominio',
        en: 'Beach access via a stairway in the community',
      },
    },
    {
      icone: 'praia',
      texto: {
        pt: 'A poucos metros da praia de Geribá',
        es: 'A pocos metros de la playa de Geribá',
        en: 'Just a few meters from Geribá Beach',
      },
    },
  ],
  regrasProprias: {
    evento: 'com-autorizacao',
    fumar: 'area-externa',
    // o anúncio diz "triplex" e a foto 35 mostra a escada externa; sem julgar se serve para idoso ou criança pequena
    escadas: {
      texto: {
        pt: 'Casa em 3 andares (triplex), com escadas externas',
        es: 'Casa de 3 pisos (tríplex), con escaleras exteriores',
        en: 'Three-story house (triplex) with outdoor stairs',
      },
      veioDaFoto: true,
    },
    // o dono ainda não disse. Atenção: na foto 34 (jardim-e-suite.jpg), embaixo da varanda de cima, à direita, há um
    // aparelho que parece câmera de segurança voltada para o jardim; na 04 (deck-mesa-e-vista-mar.jpg), embaixo do
    // beiral, outro (câmera ou refletor). Se for câmera, preencher { tem: true, onde: {...} } com o lugar: recortar a
    // foto não dispensa o aviso. A venda fica fechada até a resposta.
    cameras: null,
  },
  diariaCentavos: 150000,
  diariaFimDeSemanaCentavos: 180000,
  diariaFeriadoCentavos: 220000,
  diariaReveillonCentavos: 220000,
  minimoNoites: 2,
  fimDeSemanaJunto: true,
  pacotes: pacotesDoAno(220000, 220000),
  bloqueios: [
    { inicio: '2026-11-07', fim: '2026-12-07', referencia: 'Bloqueio inicial: 30 noites já vendidas pelo Airbnb (07/11 a 06/12/2026)' },
  ],
  fotos: [
    { origem: '01-piscina-vista-praia-de-geriba.jpg', arquivo: 'piscina-com-prainha.jpg' },
    { origem: '02-lounge-envidracado-deck-vista-mar.jpg', arquivo: 'lounge-envidracado-e-deck.jpg' },
    { origem: '03-vista-praia-de-geriba-do-alto.jpg', arquivo: 'praia-vista-do-alto.jpg' },
    { origem: '04-deck-mesa-externa-vista-mar.jpg', arquivo: 'deck-mesa-e-vista-mar.jpg' },
    { origem: '05-piscina-vista-oceano-e-ilhas.jpg', arquivo: 'piscina-vista-oceano.jpg' },
    { origem: '06-piscina-e-casa-entardecer.jpg', arquivo: 'piscina-ao-entardecer.jpg' },
    { origem: '07-piscina-borda-vista-oceano.jpg', arquivo: 'borda-da-piscina-e-oceano.jpg' },
    { origem: '08-piscina-e-lounge.jpg', arquivo: 'piscina-e-lounge.jpg' },
    { origem: '09-piscina-por-do-sol.jpg', arquivo: 'piscina-por-do-sol.jpg' },
    { origem: '10-piscina-puff-vista-praia.jpg', arquivo: 'almofadao-na-beira-da-piscina.jpg' },
    { origem: '11-piscina-e-varanda.jpg', arquivo: 'piscina-e-varanda.jpg' },
    { origem: '12-piscina-vista-baia.jpg', arquivo: 'piscina-e-ilhas.jpg' },
    { origem: '13-lounge-puffs-e-bar.jpg', arquivo: 'lounge-coberto-e-bar.jpg' },
    { origem: '14-puffs-vista-praia-de-geriba.jpg', arquivo: 'puffs-e-vista-da-praia.jpg' },
    { origem: '15-lounge-coberto-vista.jpg', arquivo: 'lounge-coberto.jpg' },
    { origem: '16-deck-coberto-puffs-vista.jpg', arquivo: 'deck-coberto-com-puffs.jpg' },
    { origem: '17-lounge-envidracado-de-frente.jpg', arquivo: 'lounge-envidracado.jpg' },
    { origem: '18-deck-espreguicadeira-e-braseiro.jpg', arquivo: 'espreguicadeira-e-braseiro.jpg' },
    { origem: '19-varanda-entardecer.jpg', arquivo: 'varanda-ao-entardecer.jpg' },
    { origem: '20-braseiro-a-noite.jpg', arquivo: 'braseiro-a-noite.jpg' },
    { origem: '21-deck-espreguicadeiras-e-jardim.jpg', arquivo: 'deck-e-jardim.jpg' },
    { origem: '22-puffs-vista-praia.jpg', arquivo: 'puffs-laranja-e-praia.jpg' },
    { origem: '23-puffs-vista-mar.jpg', arquivo: 'puffs-laranja-e-mar.jpg' },
    { origem: '24-bar-e-churrasqueira-pergolado.jpg', arquivo: 'bar-e-churrasqueira.jpg' },
    { origem: '25-bar-vista-mar.jpg', arquivo: 'bar-com-vista-mar.jpg' },
    { origem: '26-area-gourmet-e-piscina.jpg', arquivo: 'area-gourmet-e-piscina.jpg' },
    { origem: '27-fachada-e-jardim.jpg', arquivo: 'fachada-e-jardim.jpg' },
    { origem: '28-fachada-varandas-de-vidro.jpg', arquivo: 'fachada-varandas-de-vidro.jpg' },
    { origem: '29-casa-no-alto-do-morro.jpg', arquivo: 'casa-entre-a-vegetacao.jpg' },
    { origem: '30-casa-e-gramado.jpg', arquivo: 'casa-e-gramado.jpg' },
    { origem: '31-entrada-varanda-e-sala-de-jantar.jpg', arquivo: 'varanda-de-entrada.jpg' },
    { origem: '32-mesa-externa-varanda.jpg', arquivo: 'mesa-na-varanda.jpg' },
    { origem: '33-varanda-mesa-e-banco.jpg', arquivo: 'varanda-mesa-e-banco.jpg' },
    { origem: '34-jardim-e-suite-terreo.jpg', arquivo: 'jardim-e-suite.jpg' },
    { origem: '35-jardim-escada-e-rede.jpg', arquivo: 'jardim-escada-e-rede.jpg' },
    { origem: '36-varanda-de-madeira-vista-mar.jpg', arquivo: 'varanda-de-madeira.jpg' },
    { origem: '37-sala-de-estar-vista-pelo-vidro.jpg', arquivo: 'sala-vista-pelo-vidro.jpg' },
    { origem: '38-canto-escrivaninha-vista-mar.jpg', arquivo: 'escrivaninha-vista-mar.jpg' },
    { origem: '39-quarto-duas-camas-de-casal.jpg', arquivo: 'quarto-5.jpg' },
    { origem: '40-quarto-duas-camas-de-casal-outro-angulo.jpg', arquivo: 'quarto-5-outro-angulo.jpg' },
    { origem: '41-banheiro-a-bancada-dupla.jpg', arquivo: 'banheiro-pia-dupla.jpg' },
    { origem: '42-banheiro-b.jpg', arquivo: 'banheiro-box-de-vidro.jpg' },
    { origem: '43-banheiro-c.jpg', arquivo: 'banheiro-chuveiro-de-teto.jpg' },
    { origem: '44-banheiro-d.jpg', arquivo: 'banheiro-ducha-higienica.jpg' },
    { origem: '45-banheiro-e.jpg', arquivo: 'banheiro-toalhas-laranja.jpg' },
    { origem: '46-vista-praia-de-geriba-da-varanda.jpg', arquivo: 'praia-vista-da-varanda.jpg' },
    { origem: '47-praia-de-geriba.jpg', arquivo: 'praia-e-mar.jpg' },
    { origem: '48-por-do-sol-sobre-os-telhados.jpg', arquivo: 'por-do-sol-sobre-os-telhados.jpg' },
    { origem: '49-vista-bairro-e-baia.jpg', arquivo: 'vista-do-bairro-e-da-baia.jpg' },
    { origem: '50-vista-praia-e-serra.jpg', arquivo: 'praia-e-serra.jpg' },
  ],
  // as que mostram onde a casa fica (vistas aéreas e de longe) já ficaram fora da escolha das 50 (DADOS.md)
  fotosDeFora: [],
};

export const CASAS_PARA_CADASTRAR: CasaParaCadastrar[] = [ferradura, geriba];

/** O endereço público de cada foto da casa, na ordem de capa. */
export const fotosNoSite = (c: CasaParaCadastrar) => c.fotos.map((f) => `/fotos/casas/${c.slug}/${f.arquivo}`);

/* ------------------------------------------------------------------ */
/* As listas de texto das colunas antigas (camas, comodidades, regras  */
/* e cancelamento), para a página e o painel de hoje enxergarem a casa */

type IdiomaDaLista = 'pt' | 'es' | 'en' | 'es-ar';
/** O texto no idioma; no 'es-ar', a versão argentina quando ela existe, senão o 'es' (como em src/i18n/conteudo.ts). */
const em = (t: Texto, i: IdiomaDaLista): string => (i === 'es-ar' ? (t['es-ar'] ?? t.es) : t[i]);
/** A lista nos idiomas; a versão argentina só entra quando alguma linha muda (sem ela, o /es-ar lê o es). */
function porIdioma(fazer: (idioma: IdiomaDaLista) => string[]): Lista {
  const lista: Lista = { pt: fazer('pt'), es: fazer('es'), en: fazer('en') };
  const argentina = fazer('es-ar');
  return argentina.some((t, n) => t !== lista.es[n]) ? { ...lista, 'es-ar': argentina } : lista;
}
const juntar: Record<IdiomaDaLista, string> = { pt: ' e ', es: ' y ', en: ' and ', 'es-ar': ' y ' };

export function listasDaCasa(c: CasaParaCadastrar): { camas: Lista; comodidades: Lista; regras: Lista; cancelamento: Lista } {
  const regrasDaCasa: Texto[] = [
    ...(c.regrasProprias.evento ? [REGRAS_EVENTO[c.regrasProprias.evento]] : []),
    ...(c.regrasProprias.fumar ? [REGRAS_FUMAR[c.regrasProprias.fumar]] : []),
    ...(c.regrasProprias.escadas ? [c.regrasProprias.escadas.texto] : []),
  ];
  return {
    camas: porIdioma((i) =>
      c.quartosDetalhe.map((q) => {
        const camas = q.camas.map(
          (cama) => `${cama.quantidade} ${em(cama.quantidade === 1 ? CAMAS[cama.tipo].um : CAMAS[cama.tipo].varios, i)}`,
        );
        return `${em(q.nome, i)}: ${camas.join(juntar[i])}`;
      }),
    ),
    comodidades: porIdioma((i) =>
      c.comodidadesMarcadas.map((m) => {
        const nome = em(COMODIDADES[m.id].nome, i);
        return m.detalhe ? `${nome} · ${em(m.detalhe, i)}` : nome;
      }),
    ),
    regras: porIdioma((i) => [...regrasDeTodasAsCasas(c.capacidade), ...regrasDaCasa].map((r) => em(r, i))),
    cancelamento: porIdioma((i) => CANCELAMENTO_DAS_CASAS.map((r) => em(r, i))),
  };
}

/**
 * A linha da tabela casas, desligada. Endereço, ponto no mapa, limpeza, caução e calendário de fora ficam vazios. É a
 * que scripts/cadastrar-casas.ts grava e a que a prévia local (src/lib/casas-previa.ts, só com CASAS_PREVIA=1) lê.
 */
export function linhaDaCasa(c: CasaParaCadastrar): TablesInsert<'casas'> {
  const listas = listasDaCasa(c);
  return {
    slug: c.slug,
    ativo: false,
    cidade: c.cidade,
    nome: c.nome,
    bairro: c.local,
    resumo: c.resumo,
    descricao: c.descricao,
    endereco: null,
    lat_aprox: null,
    lng_aprox: null,
    quartos: c.quartos,
    suites: c.suites,
    banheiros: c.banheiros,
    capacidade: c.capacidade,
    camas: listas.camas,
    comodidades: listas.comodidades,
    regras: listas.regras,
    cancelamento: listas.cancelamento,
    check_in: '15h',
    check_out: '12h',
    diaria_base_centavos: c.diariaCentavos,
    minimo_noites: c.minimoNoites,
    taxa_limpeza_centavos: null,
    caucao_centavos: null,
    fotos: fotosNoSite(c),
    ical_url: null,
    ...colunasDosDetalhes({
      lavabos: c.lavabos,
      diariaFimDeSemanaCentavos: c.diariaFimDeSemanaCentavos,
      fimDeSemanaJunto: c.fimDeSemanaJunto,
      quartosDetalhe: c.quartosDetalhe,
      comodidadesMarcadas: c.comodidadesMarcadas,
      destaques: c.destaques,
      regrasProprias: c.regrasProprias,
      textoBairro: c.textoBairro,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Completar uma casa que já está no banco                              */

/** O que já está no banco de uma casa: os pacotes e os bloqueios (de qualquer origem). */
export interface CasaNoBanco {
  pacotes: { entrada: string; saida: string; grupo: string | null }[];
  bloqueios: { inicio: string; fim: string; origem: string }[];
}

/** O que falta gravar de uma casa que já existe, e o que não dá para gravar porque esbarra no que o banco já tem. */
export interface FaltaNoBanco {
  pacotes: Pacote[];
  bloqueios: CasaParaCadastrar['bloqueios'];
  /** Pacotes e bloqueios iniciais que dividem noites com outro já gravado: ficam de fora e aparecem na tela. */
  conflitos: string[];
}

const cruzam = (a: { de: string; ate: string }, b: { de: string; ate: string }) => a.de < b.ate && b.de < a.ate;

/**
 * Os pacotes e os bloqueios iniciais da casa que ainda não estão no banco. O --gravar do cadastro grava a casa, os
 * pacotes e os bloqueios em três passos: se um passo falhar no meio, rodar de novo completa o que faltou em vez de
 * pular a casa. Um pacote igual (mesmas datas e grupo) ou um bloqueio à mão igual já gravados contam como feitos; um
 * que divida noites com outro já gravado (o dono mudou no painel) não é gravado de novo: vira conflito, para conferir.
 */
export function oQueFaltaNoBanco(c: CasaParaCadastrar, noBanco: CasaNoBanco): FaltaNoBanco {
  const falta: FaltaNoBanco = { pacotes: [], bloqueios: [], conflitos: [] };
  for (const p of c.pacotes) {
    const grupo = p.grupo ?? null;
    if (noBanco.pacotes.some((b) => b.entrada === p.entrada && b.saida === p.saida && b.grupo === grupo)) continue;
    // as opções do mesmo grupo (o Réveillon de 4 e de 5 diárias) podem dividir noites
    const outro = noBanco.pacotes.find(
      (b) => (b.grupo === null || b.grupo !== grupo) && cruzam({ de: p.entrada, ate: p.saida }, { de: b.entrada, ate: b.saida }),
    );
    if (outro)
      falta.conflitos.push(`${p.nome.pt} (${p.entrada} a ${p.saida}) divide noites com o pacote de ${outro.entrada} a ${outro.saida}`);
    else falta.pacotes.push(p);
  }
  const aMao = noBanco.bloqueios.filter((b) => b.origem === 'manual');
  for (const b of c.bloqueios) {
    if (aMao.some((x) => x.inicio === b.inicio && x.fim === b.fim)) continue;
    const outro = aMao.find((x) => cruzam({ de: b.inicio, ate: b.fim }, { de: x.inicio, ate: x.fim }));
    if (outro)
      falta.conflitos.push(`bloqueio de ${b.inicio} a ${b.fim} divide noites com o bloqueio à mão de ${outro.inicio} a ${outro.fim}`);
    else falta.bloqueios.push(b);
  }
  return falta;
}
