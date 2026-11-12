import type { Idioma } from '../i18n/config';
import { texto, type Traduzido } from '../i18n/conteudo.ts';

/**
 * Os três idiomas de conteúdo: o espanhol da Argentina lê o texto em espanhol ('es', o neutro) e só traz a sua
 * versão ('es-ar') na foto em que a palavra muda (as do quadriciclo: cuatrimoto no neutro, cuatriciclo na Argentina).
 */
type Texto = Traduzido<string>;

/**
 * O texto alternativo de cada foto de public/fotos, escrito olhando a foto, nos três idiomas: é o que o Google
 * lê e o que o leitor de tela fala. Foto nova entra aqui junto com o arquivo (tests/fotos-alt.test.ts confere).
 * Só cite a cidade quando tiver certeza do lugar da foto. Este arquivo só pode ser lido no servidor: num
 * componente do navegador, passe o texto pronto, para a lista inteira não ir junto para o celular do cliente.
 */
export const ALT_FOTOS: Record<string, Texto> = {
  /* Arraial do Cabo */
  '/fotos/arraial/banho-com-peixes.jpg': {
    pt: 'Amigos flutuando em água verde e transparente, cercados de peixes, em Arraial do Cabo',
    en: 'Friends floating in clear green water surrounded by fish in Arraial do Cabo',
    es: 'Amigos flotando en agua verde y transparente, rodeados de peces, en Arraial do Cabo',
  },
  '/fotos/arraial/barco-arco-de-pedra.jpg': {
    pt: 'Passageiros no barco olhando o grande arco de pedra no mar de Arraial do Cabo',
    en: 'Passengers on the boat looking at the large rock arch in the sea at Arraial do Cabo',
    es: 'Pasajeros en el barco mirando el gran arco de piedra en el mar de Arraial do Cabo',
  },
  '/fotos/arraial/barco-de-mergulho.jpg': {
    pt: 'Cilindros de mergulho na popa do barco, com o mar azul e os rochedos ao fundo',
    en: 'Dive tanks at the stern of the boat, with the blue sea and rocks behind',
    es: 'Tanques de buceo en la popa del barco, con el mar azul y las rocas de fondo',
  },
  '/fotos/arraial/barco-gruta.jpg': {
    pt: 'Barco de passeio em frente a uma gruta de pedra, em mar azul-escuro',
    en: 'Tour boat in front of a rock cave on a deep blue sea',
    es: 'Barco de paseo frente a una gruta de piedra, en un mar azul profundo',
  },
  '/fotos/arraial/barco-toboga.jpg': {
    pt: 'Barco de passeio com tobogãs e pessoas tomando banho de mar em água turquesa',
    en: 'Tour boat with water slides and people swimming in turquoise water',
    es: 'Barco de paseo con toboganes y gente bañándose en agua turquesa',
  },
  '/fotos/arraial/barcos-agua-turquesa.jpg': {
    pt: 'Barcos ancorados na água turquesa de Arraial do Cabo',
    en: 'Boats anchored in the turquoise water of Arraial do Cabo',
    es: 'Barcos anclados en el agua turquesa de Arraial do Cabo',
  },
  '/fotos/arraial/costao-fenda.jpg': {
    pt: 'Fenda estreita entre dois paredões de pedra cobertos de mata, à beira do mar azul',
    en: 'Narrow gap between two forested rock walls by the blue sea',
    es: 'Grieta angosta entre dos paredones de piedra con vegetación, junto al mar azul',
  },
  '/fotos/arraial/escada-do-barco-girassois.jpg': {
    pt: 'Mulher subindo a escada do barco enfeitada com girassóis, em água turquesa',
    en: 'Woman climbing the boat ladder decorated with sunflowers in turquoise water',
    es: 'Mujer subiendo la escalera del barco decorada con girasoles, en agua turquesa',
  },
  '/fotos/arraial/escada-para-a-praia.jpg': {
    pt: 'Escada de madeira que desce até a praia de areia branca em Arraial do Cabo',
    en: 'Wooden stairway down to the white sand beach in Arraial do Cabo',
    es: 'Escalera de madera que baja a la playa de arena blanca en Arraial do Cabo',
  },
  '/fotos/arraial/escada-pontal-do-atalaia.jpg': {
    pt: 'Mulher na escada de madeira do Pontal do Atalaia, com a praia e o mar turquesa ao fundo',
    en: 'Woman on the wooden stairs at Pontal do Atalaia, with the beach and turquoise sea behind',
    es: 'Mujer en la escalera de madera del Pontal do Atalaia, con la playa y el mar turquesa de fondo',
  },
  '/fotos/arraial/lancha-agua-turquesa-do-alto.jpg': {
    pt: 'Lancha branca vista do alto na água turquesa de Arraial do Cabo',
    en: 'White speedboat seen from above in the turquoise water of Arraial do Cabo',
    es: 'Lancha blanca vista desde arriba en el agua turquesa de Arraial do Cabo',
  },
  '/fotos/arraial/letreiro-eu-amo-arraial.jpg': {
    pt: 'Letreiro colorido “Eu amo Arraial do Cabo” na orla',
    en: 'Colorful “I love Arraial do Cabo” sign on the waterfront',
    es: 'Cartel colorido “Amo Arraial do Cabo” en la costanera',
  },
  '/fotos/arraial/mergulho-baiacu.jpg': {
    pt: 'Mergulhador nadando sobre o recife, com um baiacu entre os corais',
    en: 'Diver swimming over the reef with a pufferfish among the corals',
    es: 'Buzo nadando sobre el arrecife, con un pez globo entre los corales',
  },
  '/fotos/arraial/mergulho-cardume.jpg': {
    pt: 'Mergulhador no fundo do mar com um cardume passando acima',
    en: 'Diver on the seabed with a school of fish passing overhead',
    es: 'Buzo en el fondo del mar con un cardumen pasando por arriba',
  },
  '/fotos/arraial/mergulho-com-instrutor.jpg': {
    pt: 'Mergulhadora de mãos dadas com o instrutor no fundo do mar',
    en: 'Diver holding hands with the instructor underwater',
    es: 'Buceadora de la mano del instructor en el fondo del mar',
  },
  '/fotos/arraial/mergulho-dupla-no-fundo.jpg': {
    pt: 'Dupla de mergulhadores sobre o recife colorido de Arraial do Cabo',
    en: 'Two divers over the colorful reef of Arraial do Cabo',
    es: 'Dos buzos sobre el arrecife colorido de Arraial do Cabo',
  },
  '/fotos/arraial/mergulho-dupla-ok.jpg': {
    pt: 'Dupla de mergulhadores fazendo o sinal de ok embaixo d’água',
    en: 'Two divers making the OK sign underwater',
    es: 'Dos buzos haciendo la seña de ok bajo el agua',
  },
  '/fotos/arraial/mergulho-nadando.jpg': {
    pt: 'Mergulhador nadando de braços abertos em água azul',
    en: 'Diver swimming with open arms in blue water',
    es: 'Buzo nadando con los brazos abiertos en agua azul',
  },
  '/fotos/arraial/mergulho-peixe-anjo.jpg': {
    pt: 'Dois peixes-anjo sobre a pedra, com mergulhadores ao fundo',
    en: 'Two angelfish on a rock with divers behind',
    es: 'Dos peces ángel sobre la piedra, con buzos de fondo',
  },
  '/fotos/arraial/mergulho-peixes-vermelhos.jpg': {
    pt: 'Mergulhador entre peixes vermelhos, sob uma pedra coberta de corais',
    en: 'Diver among red fish under a coral-covered rock',
    es: 'Buzo entre peces rojos, bajo una piedra cubierta de corales',
  },
  '/fotos/arraial/mergulho-retrato.jpg': {
    pt: 'Retrato de mergulhador com equipamento completo sobre o recife',
    en: 'Portrait of a diver in full gear over the reef',
    es: 'Retrato de un buzo con equipo completo sobre el arrecife',
  },
  '/fotos/arraial/mergulho-sargentinhos.jpg': {
    pt: 'Mergulhadores cercados de sargentinhos, peixes listrados de amarelo e preto',
    en: 'Divers surrounded by sergeant majors, yellow and black striped fish',
    es: 'Buzos rodeados de sargentos, peces rayados de amarillo y negro',
  },
  '/fotos/arraial/mergulho-sinal-ok.jpg': {
    pt: 'Mergulhador fazendo o sinal de ok logo abaixo da superfície',
    en: 'Diver making the OK sign just below the surface',
    es: 'Buzo haciendo la seña de ok justo debajo de la superficie',
  },
  '/fotos/arraial/mergulho-tartaruga-azul.jpg': {
    pt: 'Tartaruga-marinha nadando ao lado de um mergulhador em água azul',
    en: 'Sea turtle swimming beside a diver in blue water',
    es: 'Tortuga marina nadando junto a un buzo en agua azul',
  },
  '/fotos/arraial/mergulho-tartaruga-de-perto.jpg': {
    pt: 'Mergulhadora ao lado de uma tartaruga-marinha, bem de perto',
    en: 'Diver right next to a sea turtle',
    es: 'Buceadora junto a una tortuga marina, bien de cerca',
  },
  '/fotos/arraial/mergulho-tartaruga-na-pedra.jpg': {
    pt: 'Tartaruga-marinha pousada nas pedras coloridas, com um mergulhador atrás',
    en: 'Sea turtle resting on colorful rocks with a diver behind',
    es: 'Tortuga marina apoyada en las piedras coloridas, con un buzo detrás',
  },
  '/fotos/arraial/mergulho-tartaruga-no-coral.jpg': {
    pt: 'Mergulhadores observando uma tartaruga-marinha entre os corais',
    en: 'Divers watching a sea turtle among the corals',
    es: 'Buzos observando una tortuga marina entre los corales',
  },
  '/fotos/arraial/mergulho-tartaruga-selfie.jpg': {
    pt: 'Mergulhador fazendo uma selfie com uma tartaruga-marinha',
    en: 'Diver taking a selfie with a sea turtle',
    es: 'Buzo sacándose una selfie con una tortuga marina',
  },
  '/fotos/arraial/mergulho.jpg': {
    pt: 'Mergulhadora atravessando um túnel de pedra coberto de corais coloridos',
    en: 'Diver going through a rock tunnel covered in colorful corals',
    es: 'Buceadora atravesando un túnel de piedra cubierto de corales coloridos',
  },
  '/fotos/arraial/mirante-praia-do-forno.jpg': {
    pt: 'Pessoa sentada no mirante da Praia do Forno, de frente para a água turquesa',
    en: 'Person sitting at the Praia do Forno viewpoint, facing the turquoise water',
    es: 'Persona sentada en el mirador de Praia do Forno, frente al agua turquesa',
  },
  '/fotos/arraial/mural-viver-bem.jpg': {
    pt: 'Mural pintado em Arraial do Cabo com a frase “Viver bem é a nossa praia”',
    en: 'Painted mural in Arraial do Cabo with a beach scene and a phrase about living well',
    es: 'Mural pintado en Arraial do Cabo con una escena de playa y una frase sobre vivir bien',
  },
  '/fotos/arraial/placa-na-praia.jpg': {
    pt: 'Poste com placas coloridas na areia da praia, com guarda-sóis ao fundo',
    en: 'Post with colorful signs on the beach sand, with umbrellas behind',
    es: 'Poste con carteles coloridos en la arena de la playa, con sombrillas de fondo',
  },
  '/fotos/arraial/placas-coloridas.jpg': {
    pt: 'Placas coloridas de boas-vindas em Arraial do Cabo',
    en: 'Colorful welcome signs in Arraial do Cabo',
    es: 'Carteles coloridos de bienvenida en Arraial do Cabo',
  },
  '/fotos/arraial/pontal-do-atalaia-vista.jpg': {
    pt: 'Vista do alto do Pontal do Atalaia, com a praia e o mar azul',
    en: 'View from above of Pontal do Atalaia, with the beach and blue sea',
    es: 'Vista desde lo alto del Pontal do Atalaia, con la playa y el mar azul',
  },
  '/fotos/arraial/portal-de-entrada.jpg': {
    pt: 'Portal de entrada de Arraial do Cabo visto de dentro do carro',
    en: 'Arraial do Cabo entrance gate seen from the car',
    es: 'Portal de entrada de Arraial do Cabo visto desde el auto',
  },
  '/fotos/arraial/portal-eu-amo-arraial.jpg': {
    pt: 'Portal branco de Arraial do Cabo e letreiro colorido com um coração vermelho',
    en: 'White Arraial do Cabo gate and colorful sign with a red heart',
    es: 'Portal blanco de Arraial do Cabo y cartel colorido con un corazón rojo',
  },
  '/fotos/arraial/snorkel-com-peixes.jpg': {
    pt: 'Pessoas de snorkel acenando acima de peixes coloridos em água transparente',
    en: 'People snorkeling and waving above colorful fish in clear water',
    es: 'Personas con snorkel saludando sobre peces coloridos en agua transparente',
  },

  /* Búzios */
  '/fotos/buzios/buggy-amarelo-centro.jpg': {
    pt: 'Buggy amarelo com passageiros em rua de pedras de Búzios',
    en: 'Yellow buggy with passengers on a cobblestone street in Búzios',
    es: 'Buggy amarillo con pasajeros en una calle empedrada de Búzios',
  },
  '/fotos/buzios/buggy-amarelo-flores.jpg': {
    pt: 'Mulher ao lado de um buggy amarelo, em frente a um jardim de Búzios',
    en: 'Woman next to a yellow buggy in front of a garden in Búzios',
    es: 'Mujer junto a un buggy amarillo, frente a un jardín de Búzios',
  },
  '/fotos/buzios/buggy-centro.jpg': {
    pt: 'Buggies em rua de pedras à beira da baía de Búzios, com barcos ao fundo',
    en: 'Buggies on a cobblestone street by the bay in Búzios, with boats behind',
    es: 'Buggies en una calle empedrada junto a la bahía de Búzios, con barcos de fondo',
  },
  '/fotos/buzios/buggy-comboio.jpg': {
    pt: 'Fila de buggies coloridos no mirante, com morros verdes e o mar ao fundo',
    en: 'Line of colorful buggies at a viewpoint, with green hills and the sea behind',
    es: 'Fila de buggies coloridos en el mirador, con cerros verdes y el mar de fondo',
  },
  '/fotos/buzios/buggy-ferradura.jpg': {
    pt: 'Amigos sobre um buggy azul junto à placa da Praia da Ferradura, em Búzios',
    en: 'Friends on a blue buggy by the Ferradura beach sign in Búzios',
    es: 'Amigos sobre un buggy azul junto al cartel de la Playa Ferradura, en Búzios',
  },
  '/fotos/buzios/buggy-laranja-mirante.jpg': {
    pt: 'Buggy laranja no mirante, com a enseada e os morros de Búzios ao fundo',
    en: 'Orange buggy at a viewpoint, with the bay and hills of Búzios behind',
    es: 'Buggy naranja en el mirador, con la ensenada y los cerros de Búzios de fondo',
  },
  '/fotos/buzios/buggy-mirante.jpg': {
    pt: 'Buggies azul, amarelo e branco no mirante, com a enseada de Búzios ao fundo',
    en: 'Blue, yellow and white buggies at a viewpoint over the bay in Búzios',
    es: 'Buggies azul, amarillo y blanco en el mirador, con la ensenada de Búzios de fondo',
  },
  '/fotos/buzios/buggy-orla.jpg': {
    pt: 'Buggy vermelho na orla de Búzios, com coqueiros e o mar ao fundo',
    en: 'Red buggy on the Búzios waterfront, with palm trees and the sea behind',
    es: 'Buggy rojo en la costanera de Búzios, con palmeras y el mar de fondo',
  },
  '/fotos/buzios/buggy-passeio.jpg': {
    pt: 'Duas mulheres em um buggy vermelho numa rua de Búzios',
    en: 'Two women in a red buggy on a street in Búzios',
    es: 'Dos mujeres en un buggy rojo en una calle de Búzios',
  },
  '/fotos/buzios/buggy-praia-do-canto.jpg': {
    pt: 'Buggy amarelo junto à placa da Praia do Canto, em Búzios',
    en: 'Yellow buggy by the Praia do Canto sign in Búzios',
    es: 'Buggy amarillo junto al cartel de Praia do Canto, en Búzios',
  },
  '/fotos/buzios/buggy-praia.jpg': {
    pt: 'Buggies branco e azul em fila numa estrada à beira da praia, em Búzios',
    en: 'White and blue buggies in line on a beachside road in Búzios',
    es: 'Buggies blanco y azul en fila en un camino junto a la playa, en Búzios',
  },
  '/fotos/buzios/buggy-verde.jpg': {
    pt: 'Homem ao volante de um buggy verde-água em rua de pedras de Búzios',
    en: 'Man at the wheel of a teal buggy on a cobblestone street in Búzios',
    es: 'Hombre al volante de un buggy verde agua en una calle empedrada de Búzios',
  },
  '/fotos/buzios/buggy-vermelho-mirante.jpg': {
    pt: 'Mulher em pé em um buggy vermelho, visto de trás, em um mirante de Búzios',
    en: 'Woman standing in a red buggy, seen from behind, at a viewpoint in Búzios',
    es: 'Mujer de pie en un buggy rojo, visto de atrás, en un mirador de Búzios',
  },
  '/fotos/buzios/catamara-ancorado.jpg': {
    pt: 'Catamarã branco ancorado em mar verde, sob céu com nuvens',
    en: 'White catamaran anchored on a green sea under a cloudy sky',
    es: 'Catamarán blanco anclado en un mar verde, bajo un cielo con nubes',
  },
  '/fotos/buzios/catamara-banho.jpg': {
    pt: 'Passageiros no catamarã vendo as pessoas nadarem em água verde-azulada',
    en: 'Passengers on the catamaran watching people swim in blue-green water',
    es: 'Pasajeros en el catamarán viendo a la gente nadar en agua verde azulada',
  },
  '/fotos/buzios/catamara-do-alto.jpg': {
    pt: 'Catamarã visto do alto em frente à praia e aos morros de Búzios',
    en: 'Catamaran seen from above in front of the beach and hills of Búzios',
    es: 'Catamarán visto desde arriba frente a la playa y los cerros de Búzios',
  },
  '/fotos/buzios/catamara-navegando.jpg': {
    pt: 'Catamarã de dois andares navegando em mar azul, com passageiros a bordo',
    en: 'Two-deck catamaran sailing on a blue sea with passengers on board',
    es: 'Catamarán de dos pisos navegando en un mar azul, con pasajeros a bordo',
  },
  '/fotos/buzios/escada-para-a-praia.jpg': {
    pt: 'Escada de madeira que desce até o mar verde em Búzios',
    en: 'Wooden stairway down to the green sea in Búzios',
    es: 'Escalera de madera que baja hasta el mar verde en Búzios',
  },
  '/fotos/buzios/escuna-ancorada.jpg': {
    pt: 'Escuna ancorada em mar verde-azulado, com morros ao fundo',
    en: 'Schooner anchored on a blue-green sea with hills behind',
    es: 'Goleta anclada en un mar verde azulado, con cerros de fondo',
  },
  '/fotos/buzios/escuna-azul-no-pier.jpg': {
    pt: 'Escuna azul e branca atracada no píer',
    en: 'Blue and white schooner moored at the pier',
    es: 'Goleta azul y blanca amarrada en el muelle',
  },
  '/fotos/buzios/escuna-mastros.jpg': {
    pt: 'Mastros de uma escuna atracada no píer, com bandeiras ao vento',
    en: 'Masts of a schooner moored at the pier, with flags in the wind',
    es: 'Mástiles de una goleta amarrada en el muelle, con banderas al viento',
  },
  '/fotos/buzios/escuna-no-mar.jpg': {
    pt: 'Escuna de madeira ancorada no mar de Búzios, com pessoas nadando ao redor',
    en: 'Wooden schooner anchored off Búzios with people swimming around it',
    es: 'Goleta de madera anclada en el mar de Búzios, con gente nadando alrededor',
  },
  '/fotos/buzios/escuna-no-pier.jpg': {
    pt: 'Escuna de madeira atracada no píer de Búzios',
    en: 'Wooden schooner moored at the pier in Búzios',
    es: 'Goleta de madera amarrada en el muelle de Búzios',
  },
  '/fotos/buzios/escuna-perto-da-gruta.jpg': {
    pt: 'Escuna em frente a uma gruta de pedra, em mar azul-escuro',
    en: 'Schooner in front of a rock cave on a deep blue sea',
    es: 'Goleta frente a una gruta de piedra, en un mar azul profundo',
  },
  '/fotos/buzios/escuna-proa.jpg': {
    pt: 'Rede na proa de uma escuna, com a costa de Búzios ao fundo',
    en: 'Net at the bow of a schooner, with the Búzios coast behind',
    es: 'Red en la proa de una goleta, con la costa de Búzios de fondo',
  },
  '/fotos/buzios/escuna-rede-da-proa.jpg': {
    pt: 'Rede da proa da escuna vista de perto, com o céu azul e o mar à frente',
    en: 'Close view of the schooner bow net, with blue sky and sea ahead',
    es: 'Red de la proa de la goleta vista de cerca, con el cielo azul y el mar adelante',
  },
  '/fotos/buzios/escuna-toboga-banho.jpg': {
    pt: 'Escuna vermelha vista do alto, com pessoas nadando em água turquesa em frente à praia',
    en: 'Red schooner seen from above, with people swimming in turquoise water off the beach',
    es: 'Goleta roja vista desde arriba, con gente nadando en agua turquesa frente a la playa',
  },
  '/fotos/buzios/escuna-toboga-do-alto.jpg': {
    pt: 'Escuna vista do alto em água turquesa, com pessoas nadando ao redor',
    en: 'Schooner seen from above in turquoise water, with people swimming around it',
    es: 'Goleta vista desde arriba en agua turquesa, con gente nadando alrededor',
  },
  '/fotos/buzios/escuna-toboga-e-banho.jpg': {
    pt: 'Escuna com tobogãs e pessoas tomando banho de mar em água turquesa',
    en: 'Schooner with water slides and people swimming in turquoise water',
    es: 'Goleta con toboganes y gente bañándose en agua turquesa',
  },
  '/fotos/buzios/estatua-brigitte-bardot.jpg': {
    pt: 'Estátua de Brigitte Bardot na orla de Búzios, com coqueiros e o mar ao fundo',
    en: 'Brigitte Bardot statue on the Búzios waterfront, with palm trees and the sea behind',
    es: 'Estatua de Brigitte Bardot en la costanera de Búzios, con palmeras y el mar de fondo',
  },
  '/fotos/buzios/helicoptero-amigos.jpg': {
    pt: 'Piloto e passageiros de fone de ouvido dentro do helicóptero, sobrevoando o mar',
    en: 'Pilot and passengers wearing headsets inside the helicopter, flying over the sea',
    es: 'Piloto y pasajeros con auriculares dentro del helicóptero, sobrevolando el mar',
  },
  '/fotos/buzios/helicoptero-cabine.jpg': {
    pt: 'Mulher de fone de ouvido olhando a paisagem pela janela do helicóptero',
    en: 'Woman wearing a headset looking at the view from the helicopter window',
    es: 'Mujer con auriculares mirando el paisaje por la ventana del helicóptero',
  },
  '/fotos/buzios/helicoptero-navio-de-cruzeiro.jpg': {
    pt: 'Navio de cruzeiro no mar azul, visto da cabine do helicóptero',
    en: 'Cruise ship on the blue sea, seen from the helicopter cabin',
    es: 'Crucero en el mar azul, visto desde la cabina del helicóptero',
  },
  '/fotos/buzios/helicoptero-no-ar.jpg': {
    pt: 'Helicóptero no ar sobre o mar e a península de Búzios',
    en: 'Helicopter in the air over the sea and the Búzios peninsula',
    es: 'Helicóptero en el aire sobre el mar y la península de Búzios',
  },
  '/fotos/buzios/helicoptero-pousado.jpg': {
    pt: 'Helicóptero preto pousado na pista',
    en: 'Black helicopter parked on the runway',
    es: 'Helicóptero negro posado en la pista',
  },
  '/fotos/buzios/helicoptero-sobre-a-praia.jpg': {
    pt: 'Passageira no helicóptero sobrevoando uma praia de água verde',
    en: 'Passenger in the helicopter flying over a beach with green water',
    es: 'Pasajera en el helicóptero sobrevolando una playa de agua verde',
  },
  '/fotos/buzios/helicoptero-vista-da-peninsula.jpg': {
    pt: 'Passageiro apontando a península de Búzios da cabine do helicóptero',
    en: 'Passenger pointing at the Búzios peninsula from the helicopter cabin',
    es: 'Pasajero señalando la península de Búzios desde la cabina del helicóptero',
  },
  '/fotos/buzios/jet-ski-casal.jpg': {
    pt: 'Casal em um jet ski fazendo curva no mar verde-água',
    en: 'Couple on a jet ski turning on the blue-green sea',
    es: 'Pareja en una moto de agua haciendo una curva en el mar verde agua',
  },
  '/fotos/buzios/jet-ski-contraluz.jpg': {
    pt: 'Jet ski parado no mar, à contraluz do sol',
    en: 'Jet ski stopped on the sea, backlit by the sun',
    es: 'Moto de agua detenida en el mar, a contraluz del sol',
  },
  '/fotos/buzios/jet-ski-costao.jpg': {
    pt: 'Duas pessoas de braços erguidos em um jet ski junto ao costão',
    en: 'Two people with raised arms on a jet ski by the rocky shore',
    es: 'Dos personas con los brazos en alto en una moto de agua junto a las rocas',
  },
  '/fotos/buzios/jet-ski-em-dupla.jpg': {
    pt: 'Dois jet skis navegando lado a lado no mar de Búzios',
    en: 'Two jet skis riding side by side on the sea in Búzios',
    es: 'Dos motos de agua navegando lado a lado en el mar de Búzios',
  },
  '/fotos/buzios/jet-ski-guidao.jpg': {
    pt: 'Vista do guidão de um jet ski navegando em direção aos morros',
    en: 'View from the handlebars of a jet ski riding toward the hills',
    es: 'Vista desde el manubrio de una moto de agua navegando hacia los cerros',
  },
  '/fotos/buzios/jet-ski-mar-azul.jpg': {
    pt: 'Jet ski navegando em mar azul, com morros verdes ao fundo',
    en: 'Jet ski riding on a blue sea with green hills behind',
    es: 'Moto de agua navegando en un mar azul, con cerros verdes de fondo',
  },
  '/fotos/buzios/jet-ski-morros.jpg': {
    pt: 'Casal em um jet ski no mar, com morros ao fundo',
    en: 'Couple on a jet ski on the sea with hills behind',
    es: 'Pareja en una moto de agua en el mar, con cerros de fondo',
  },
  '/fotos/buzios/jet-ski-painel.jpg': {
    pt: 'Painel e guidão de um jet ski amarelo e preto, vistos por quem pilota',
    en: 'Dashboard and handlebars of a yellow and black jet ski, from the rider’s view',
    es: 'Tablero y manubrio de una moto de agua amarilla y negra, vistos por quien maneja',
  },
  '/fotos/buzios/jet-ski-por-do-sol.jpg': {
    pt: 'Mulher sentada em um jet ski laranja durante o pôr do sol',
    en: 'Woman sitting on an orange jet ski at sunset',
    es: 'Mujer sentada en una moto de agua naranja durante el atardecer',
  },
  '/fotos/buzios/lancha-joao-fernandes.jpg': {
    pt: 'Proa de uma lancha branca em frente à Praia de João Fernandes, em Búzios',
    en: 'Bow of a white speedboat in front of João Fernandes beach in Búzios',
    es: 'Proa de una lancha blanca frente a la playa João Fernandes, en Búzios',
  },
  '/fotos/buzios/lancha.jpg': {
    pt: 'Lancha branca ancorada em mar verde-azulado em Búzios',
    en: 'White speedboat anchored on a blue-green sea in Búzios',
    es: 'Lancha blanca anclada en un mar verde azulado en Búzios',
  },
  '/fotos/buzios/letreiro-eu-amo-buzios.jpg': {
    pt: 'Mulher sentada diante do letreiro “Eu amo Búzios”',
    en: 'Woman sitting in front of the “I love Búzios” sign',
    es: 'Mujer sentada frente al cartel “Amo Búzios”',
  },
  '/fotos/buzios/letreiro-eu-buzios-noite.jpg': {
    pt: 'Letreiro “Eu amo Búzios” iluminado à noite',
    en: '“I love Búzios” sign lit up at night',
    es: 'Cartel “Amo Búzios” iluminado de noche',
  },
  '/fotos/buzios/orla-a-pe.jpg': {
    pt: 'Mulher caminhando na orla de Búzios, à sombra dos coqueiros',
    en: 'Woman walking along the Búzios waterfront in the shade of palm trees',
    es: 'Mujer caminando por la costanera de Búzios, a la sombra de las palmeras',
  },
  '/fotos/buzios/orla-bardot-flores.jpg': {
    pt: 'Orla Bardot, em Búzios, com calçada de pedras, coqueiros e flores vermelhas',
    en: 'Orla Bardot in Búzios, with a stone walkway, palm trees and red flowers',
    es: 'Orla Bardot, en Búzios, con vereda de piedras, palmeras y flores rojas',
  },
  '/fotos/buzios/passagem-para-a-praia.jpg': {
    pt: 'Passagem de pedras entre muros que leva à praia, em Búzios',
    en: 'Stone passage between walls leading to the beach in Búzios',
    es: 'Pasaje de piedras entre muros que lleva a la playa, en Búzios',
  },
  '/fotos/buzios/pedras-a-beira-mar.jpg': {
    pt: 'Mulheres sentadas nas pedras à beira do mar transparente de Búzios',
    en: 'Women sitting on the rocks by the clear sea in Búzios',
    es: 'Mujeres sentadas en las piedras junto al mar transparente de Búzios',
  },
  '/fotos/buzios/placa-das-praias.jpg': {
    pt: 'Placa de madeira com os nomes das praias de Búzios',
    en: 'Wooden signpost with the names of the Búzios beaches',
    es: 'Cartel de madera con los nombres de las playas de Búzios',
  },
  '/fotos/buzios/placa-praia-da-tartaruga.jpg': {
    pt: 'Placa da Praia da Tartaruga, em Búzios, coberta de adesivos',
    en: 'Tartaruga beach sign in Búzios, covered in stickers',
    es: 'Cartel de la Playa Tartaruga, en Búzios, cubierto de calcomanías',
  },
  '/fotos/buzios/por-do-sol-barcos-na-baia.jpg': {
    pt: 'Pôr do sol na baía de Búzios, com barcos de pesca na água',
    en: 'Sunset over the bay in Búzios, with fishing boats on the water',
    es: 'Atardecer en la bahía de Búzios, con barcos de pesca en el agua',
  },
  '/fotos/buzios/praia-dos-ossos-barcos.jpg': {
    pt: 'Barcos na água transparente da Praia dos Ossos, em Búzios',
    en: 'Boats in the clear water of Praia dos Ossos in Búzios',
    es: 'Barcos en el agua transparente de Praia dos Ossos, en Búzios',
  },
  '/fotos/buzios/totem-joao-fernandes.jpg': {
    pt: 'Mulher diante do totem colorido de Búzios, na Praia de João Fernandes',
    en: 'Woman in front of the colorful Búzios totem at João Fernandes beach',
    es: 'Mujer frente al tótem colorido de Búzios, en la playa João Fernandes',
  },
  '/fotos/buzios/trolley-jardineira.jpg': {
    pt: 'Trolley aberto com passageiros parado em um mirante de Búzios',
    en: 'Open trolley with passengers stopped at a viewpoint in Búzios',
    es: 'Trolley abierto con pasajeros detenido en un mirador de Búzios',
  },
  '/fotos/buzios/vista-da-escuna.jpg': {
    pt: 'Vista do convés da escuna para o mar verde e a costa',
    en: 'View from the schooner deck of the green sea and the coast',
    es: 'Vista desde la cubierta de la goleta hacia el mar verde y la costa',
  },

  /* Cabo Frio */
  '/fotos/cabo-frio/camarao-e-caipirinha.jpg': {
    pt: 'Espetinho de camarão e caipirinha na praia',
    en: 'Shrimp skewer and caipirinha on the beach',
    es: 'Brocheta de camarones y caipiriña en la playa',
    'es-ar': 'Brochette de camarones y caipiriña en la playa',
  },
  '/fotos/cabo-frio/casario-azul-e-branco.jpg': {
    pt: 'Rua de pedras com casario azul e branco e flores, em Cabo Frio',
    en: 'Stone street with blue and white houses and flowers in Cabo Frio',
    es: 'Calle de piedras con casas azules y blancas y flores, en Cabo Frio',
  },
  '/fotos/cabo-frio/costao-forte-sao-mateus.jpg': {
    pt: 'Costão de pedras junto ao Forte São Mateus, com a Praia do Forte ao fundo',
    en: 'Rocky shore by São Mateus Fort, with Praia do Forte behind',
    es: 'Rocas junto al Fuerte São Mateus, con Praia do Forte de fondo',
  },
  '/fotos/cabo-frio/guarita-forte-sao-mateus.jpg': {
    pt: 'Guarita branca do Forte São Mateus, diante do mar azul',
    en: 'White sentry box of São Mateus Fort, facing the blue sea',
    es: 'Garita blanca del Fuerte São Mateus, frente al mar azul',
  },
  '/fotos/cabo-frio/ilha-do-japones-do-alto.jpg': {
    pt: 'Ilha do Japonês vista do alto, com bancos de areia e água turquesa',
    en: 'Japonês Island seen from above, with sandbanks and turquoise water',
    es: 'Isla del Japonês vista desde arriba, con bancos de arena y agua turquesa',
  },
  '/fotos/cabo-frio/letreiro-amo-cabo-frio.jpg': {
    pt: 'Letreiro “Amo Cabo Frio” ao entardecer, sob o céu lilás',
    en: '“I love Cabo Frio” sign at dusk under a lilac sky',
    es: 'Cartel “Amo Cabo Frio” al atardecer, bajo el cielo lila',
  },
  '/fotos/cabo-frio/orla-entardecer.jpg': {
    pt: 'Orla de Cabo Frio ao entardecer, com coqueiro e bicicleta',
    en: 'Cabo Frio waterfront at dusk, with a palm tree and a bicycle',
    es: 'Costanera de Cabo Frio al atardecer, con una palmera y una bicicleta',
  },
  '/fotos/cabo-frio/placa-praia-do-pero.jpg': {
    pt: 'Placas de madeira na Praia do Peró com a frase “Perto do mar a gente é mais feliz”',
    en: 'Wooden signs at Praia do Peró saying people are happier near the sea',
    es: 'Carteles de madera en Praia do Peró con una frase sobre ser más feliz cerca del mar',
  },
  '/fotos/cabo-frio/praia-do-forte-agua-azul.jpg': {
    pt: 'Areia dourada e água azul da Praia do Forte, com o Forte São Mateus ao fundo',
    en: 'Golden sand and blue water at Praia do Forte, with São Mateus Fort behind',
    es: 'Arena dorada y agua azul de Praia do Forte, con el Fuerte São Mateus de fondo',
  },
  '/fotos/cabo-frio/praia-do-forte-forte-sao-mateus.jpg': {
    pt: 'Praia do Forte com guarda-sóis coloridos e o Forte São Mateus ao fundo',
    en: 'Praia do Forte with colorful umbrellas and São Mateus Fort behind',
    es: 'Praia do Forte con sombrillas coloridas y el Fuerte São Mateus de fondo',
  },

  /* Lanchas (várias cidades) */
  '/fotos/lancha/lancha-agua-cristalina.jpg': {
    pt: 'Lancha branca ancorada em água transparente junto a uma ilha de mata verde',
    en: 'White speedboat anchored in clear water by a green forested island',
    es: 'Lancha blanca anclada en agua transparente junto a una isla de vegetación verde',
  },
  '/fotos/lancha/lancha-agua-rasa.jpg': {
    pt: 'Grupo tomando sol em uma lancha sobre água rasa e verde',
    en: 'Group sunbathing on a speedboat over shallow green water',
    es: 'Grupo tomando sol en una lancha sobre agua baja y verde',
  },
  '/fotos/lancha/lancha-amigas.jpg': {
    pt: 'Amigas sentadas na proa da lancha, olhando para a praia',
    en: 'Friends sitting at the bow of the speedboat, looking at the beach',
    es: 'Amigas sentadas en la proa de la lancha, mirando hacia la playa',
  },
  '/fotos/lancha/lancha-ancorada.jpg': {
    pt: 'Lancha branca ancorada em água verde, com uma pessoa em pé na proa',
    en: 'White speedboat anchored in green water with a person standing at the bow',
    es: 'Lancha blanca anclada en agua verde, con una persona de pie en la proa',
  },
  '/fotos/lancha/lancha-bancos.jpg': {
    pt: 'Bancos de couro claro da lancha, de frente para o mar verde e a costa',
    en: 'Light leather seats on the speedboat, facing the green sea and the coast',
    es: 'Asientos de cuero claro de la lancha, frente al mar verde y la costa',
  },
  '/fotos/lancha/lancha-bandeira.jpg': {
    pt: 'Bandeira do Brasil a bordo, com outra lancha ancorada perto da ilha',
    en: 'Brazilian flag on board, with another speedboat anchored near the island',
    es: 'Bandera de Brasil a bordo, con otra lancha anclada cerca de la isla',
  },
  '/fotos/lancha/lancha-cockpit.jpg': {
    pt: 'Popa da lancha com os bancos e o toldo, de frente para o mar azul',
    en: 'Stern of the speedboat with seats and canopy, facing the blue sea',
    es: 'Popa de la lancha con los asientos y el toldo, frente al mar azul',
  },
  '/fotos/lancha/lancha-entardecer.jpg': {
    pt: 'Lancha branca ancorada ao entardecer, em mar calmo',
    en: 'White speedboat anchored at dusk on a calm sea',
    es: 'Lancha blanca anclada al atardecer, en un mar calmo',
  },
  '/fotos/lancha/lancha-espumante.jpg': {
    pt: 'Mesa com balde de espumante na popa da lancha, com o mar ao fundo',
    en: 'Table with a sparkling wine bucket at the stern of the speedboat, with the sea behind',
    es: 'Mesa con balde de espumante en la popa de la lancha, con el mar de fondo',
  },
  '/fotos/lancha/lancha-grupo.jpg': {
    pt: 'Grupo a bordo da lancha, navegando sob céu azul com nuvens',
    en: 'Group on board the speedboat, cruising under a blue sky with clouds',
    es: 'Grupo a bordo de la lancha, navegando bajo un cielo azul con nubes',
  },
  '/fotos/lancha/lancha-petiscos.jpg': {
    pt: 'Bandeja de petiscos e bebidas na mesa da lancha',
    en: 'Platter of snacks and drinks on the speedboat table',
    es: 'Bandeja de aperitivos y bebidas en la mesa de la lancha',
    'es-ar': 'Bandeja de picadas y bebidas en la mesa de la lancha',
  },
  '/fotos/lancha/lancha-proa.jpg': {
    pt: 'Proa de lancha com piso de madeira, vista de cima, ancorada em mar verde',
    en: 'Speedboat bow with a wooden deck, seen from above, anchored on a green sea',
    es: 'Proa de lancha con piso de madera, vista desde arriba, anclada en un mar verde',
  },
  '/fotos/lancha/lancha-rastro.jpg': {
    pt: 'Lancha deixando rastro de espuma no mar azul',
    en: 'Speedboat leaving a foam wake on the blue sea',
    es: 'Lancha dejando una estela de espuma en el mar azul',
  },
  '/fotos/lancha/lancha-rumo-a-praia.jpg': {
    pt: 'Proa da lancha navegando em mar azul em direção à costa',
    en: 'Speedboat bow cruising on a blue sea toward the coast',
    es: 'Proa de la lancha navegando en un mar azul hacia la costa',
  },
  '/fotos/lancha/lancha-timao.jpg': {
    pt: 'Painel e timão da lancha, com morros verdes ao fundo',
    en: 'Speedboat dashboard and wheel, with green hills behind',
    es: 'Tablero y timón de la lancha, con cerros verdes de fondo',
  },
  '/fotos/lancha/lancha-vista-da-proa.jpg': {
    pt: 'Proa da lancha vista de dentro, com o mar azul à frente',
    en: 'Speedboat bow seen from inside, with the blue sea ahead',
    es: 'Proa de la lancha vista desde adentro, con el mar azul adelante',
  },

  /* Quadriciclo */
  '/fotos/quadriciclo/quadriciclo-lama.jpg': {
    pt: 'Dupla em quadriciclo laranja atravessando uma poça de lama em trilha na mata',
    en: 'Two people on an orange quad bike crossing a mud puddle on a forest trail',
    es: 'Dos personas en una cuatrimoto naranja cruzando un charco de barro en un sendero',
    'es-ar': 'Dos personas en un cuatriciclo naranja cruzando un charco de barro en un sendero',
  },
  '/fotos/quadriciclo/quadriciclo-laranja-mirante.jpg': {
    pt: 'Pessoa em quadriciclo laranja no mirante, de frente para o mar azul',
    en: 'Person on an orange quad bike at a viewpoint, facing the blue sea',
    es: 'Persona en una cuatrimoto naranja en el mirador, frente al mar azul',
    'es-ar': 'Persona en un cuatriciclo naranja en el mirador, frente al mar azul',
  },
  '/fotos/quadriciclo/quadriciclo-mirante.jpg': {
    pt: 'Homem sentado em quadriciclo vermelho, com o mar azul ao fundo',
    en: 'Man sitting on a red quad bike with the blue sea behind',
    es: 'Hombre sentado en una cuatrimoto roja, con el mar azul de fondo',
    'es-ar': 'Hombre sentado en un cuatriciclo rojo, con el mar azul de fondo',
  },
  '/fotos/quadriciclo/quadriciclo-por-do-sol.jpg': {
    pt: 'Duas mulheres de braços abertos sobre um quadriciclo, ao pôr do sol',
    en: 'Two women with open arms on a quad bike at sunset',
    es: 'Dos mujeres con los brazos abiertos sobre una cuatrimoto, al atardecer',
    'es-ar': 'Dos mujeres con los brazos abiertos sobre un cuatriciclo, al atardecer',
  },
  '/fotos/quadriciclo/quadriciclo-vermelho-mar.jpg': {
    pt: 'Mulher sentada em quadriciclo vermelho em um mirante de frente para o mar',
    en: 'Woman sitting on a red quad bike at a viewpoint facing the sea',
    es: 'Mujer sentada en una cuatrimoto roja en un mirador frente al mar',
    'es-ar': 'Mujer sentada en un cuatriciclo rojo en un mirador frente al mar',
  },
  '/fotos/quadriciclo/quadriciclos-na-areia.jpg': {
    pt: 'Três pessoas em pé sobre quadriciclos na areia da praia',
    en: 'Three people standing on quad bikes on the beach sand',
    es: 'Tres personas de pie sobre cuatrimotos en la arena de la playa',
    'es-ar': 'Tres personas de pie sobre cuatriciclos en la arena de la playa',
  },

  /* Rio de Janeiro */
  '/fotos/rio/avenida-dois-irmaos.jpg': {
    pt: 'Avenida do Rio com táxis amarelos e o Morro Dois Irmãos ao fundo',
    en: 'Rio avenue with yellow taxis and Dois Irmãos hill behind',
    es: 'Avenida de Río con taxis amarillos y el Morro Dois Irmãos de fondo',
  },
  '/fotos/rio/bondinho-pao-de-acucar.jpg': {
    pt: 'Bondinho do Pão de Açúcar chegando, visto da estação',
    en: 'Sugarloaf cable car arriving, seen from the station',
    es: 'Teleférico del Pan de Azúcar llegando, visto desde la estación',
  },
  '/fotos/rio/calcadao-leblon.jpg': {
    pt: 'Calçadão de pedras portuguesas no Leblon, com o Morro Dois Irmãos ao fundo',
    en: 'Portuguese stone promenade in Leblon, with Dois Irmãos hill behind',
    es: 'Paseo de piedras portuguesas en Leblon, con el Morro Dois Irmãos de fondo',
  },
  '/fotos/rio/copacabana-do-alto.jpg': {
    pt: 'Praia de Copacabana vista do alto, com o calçadão e os morros do Rio',
    en: 'Copacabana beach seen from above, with the promenade and Rio’s hills',
    es: 'Playa de Copacabana vista desde arriba, con el paseo y los cerros de Río',
  },
  '/fotos/rio/corcovado-de-longe.jpg': {
    pt: 'Cristo Redentor no alto do Corcovado, com o Rio e o Pão de Açúcar ao fundo',
    en: 'Christ the Redeemer on top of Corcovado, with Rio and Sugarloaf behind',
    es: 'Cristo Redentor en lo alto del Corcovado, con Río y el Pan de Azúcar de fondo',
  },
  '/fotos/rio/cristo-e-pao-de-acucar-do-ceu.jpg': {
    pt: 'Cristo Redentor e Pão de Açúcar vistos do céu, sobre a baía',
    en: 'Christ the Redeemer and Sugarloaf seen from the sky, over the bay',
    es: 'Cristo Redentor y Pan de Azúcar vistos desde el cielo, sobre la bahía',
  },
  '/fotos/rio/cristo-redentor-de-perto.jpg': {
    pt: 'Cristo Redentor visto de perto entre as árvores, com visitantes na escada',
    en: 'Close view of Christ the Redeemer among the trees, with visitors on the stairs',
    es: 'Cristo Redentor visto de cerca entre los árboles, con visitantes en la escalera',
  },
  '/fotos/rio/cristo-redentor-do-alto.jpg': {
    pt: 'Cristo Redentor visto do alto ao pôr do sol, com o mar e a cidade do Rio ao fundo',
    en: 'Christ the Redeemer seen from above at sunset, with the sea and Rio behind',
    es: 'Cristo Redentor visto desde arriba al atardecer, con el mar y Río de fondo',
  },
  '/fotos/rio/escadaria-selaron.jpg': {
    pt: 'Escadaria Selarón, no Rio, com seus azulejos coloridos',
    en: 'Selarón Steps in Rio, with their colorful tiles',
    es: 'Escalera Selarón, en Río, con sus azulejos coloridos',
  },
  '/fotos/rio/ipanema-fim-de-tarde.jpg': {
    pt: 'Praia de Ipanema no fim de tarde, com o Morro Dois Irmãos ao fundo',
    en: 'Ipanema beach in the late afternoon, with Dois Irmãos hill behind',
    es: 'Playa de Ipanema al final de la tarde, con el Morro Dois Irmãos de fondo',
  },
  '/fotos/rio/ipanema-por-do-sol.jpg': {
    pt: 'Pôr do sol no calçadão de Ipanema, com vendedor de praia e coqueiro',
    en: 'Sunset on the Ipanema promenade, with a beach vendor and a palm tree',
    es: 'Atardecer en el paseo de Ipanema, con un vendedor de playa y una palmera',
  },
  '/fotos/rio/lembrancas-do-rio.jpg': {
    pt: 'Placas e ímãs de lembrança do Rio de Janeiro',
    en: 'Rio de Janeiro souvenir plates and magnets',
    es: 'Placas e imanes de recuerdo de Río de Janeiro',
  },
  '/fotos/rio/museu-do-amanha.jpg': {
    pt: 'Museu do Amanhã, no Rio, com seu espelho d’água',
    en: 'Museum of Tomorrow in Rio, with its reflecting pool',
    es: 'Museo del Mañana, en Río, con su espejo de agua',
  },
  '/fotos/rio/pao-de-acucar-por-do-sol.jpg': {
    pt: 'Pão de Açúcar ao pôr do sol, com a cidade iluminada',
    en: 'Sugarloaf at sunset, with the city lit up',
    es: 'Pan de Azúcar al atardecer, con la ciudad iluminada',
  },
  '/fotos/rio/praia-vermelha-urca.jpg': {
    pt: 'Praia Vermelha, na Urca, com guarda-sóis coloridos e o Pão de Açúcar',
    en: 'Praia Vermelha in Urca, with colorful umbrellas and Sugarloaf',
    es: 'Praia Vermelha, en Urca, con sombrillas coloridas y el Pan de Azúcar',
  },
  '/fotos/rio/vendedor-de-praia-ipanema.jpg': {
    pt: 'Vendedor de praia com a bandeira do Brasil no calçadão de Ipanema',
    en: 'Beach vendor with the Brazilian flag on the Ipanema promenade',
    es: 'Vendedor de playa con la bandera de Brasil en el paseo de Ipanema',
  },
  '/fotos/rio/vista-do-bondinho.jpg': {
    pt: 'Vista do Rio de dentro do bondinho, com o Corcovado ao longe',
    en: 'View of Rio from inside the cable car, with Corcovado in the distance',
    es: 'Vista de Río desde adentro del teleférico, con el Corcovado a lo lejos',
  },

  /* Transfer */
  '/fotos/transfer/carro-corolla.jpg': {
    pt: 'Carro executivo prata, um Toyota Corolla, estacionado na rua',
    en: 'Silver executive car, a Toyota Corolla, parked on the street',
    es: 'Auto ejecutivo plateado, un Toyota Corolla, estacionado en la calle',
  },
  '/fotos/transfer/carro-creta-aeroporto.jpg': {
    pt: 'Carro executivo preto, um Hyundai Creta, em frente ao aeroporto',
    en: 'Black executive car, a Hyundai Creta, in front of the airport',
    es: 'Auto ejecutivo negro, un Hyundai Creta, frente al aeropuerto',
  },
  '/fotos/transfer/carro-virtus-com-clientes.jpg': {
    pt: 'Clientes ao lado do carro executivo preto, na chegada ao hotel',
    en: 'Guests next to the black executive car on arrival at the hotel',
    es: 'Clientes junto al auto ejecutivo negro, al llegar al hotel',
  },
  '/fotos/transfer/carros-creta-com-motoristas.jpg': {
    pt: 'Dois motoristas de terno ao lado de carros Hyundai Creta, um preto e um branco',
    en: 'Two drivers in suits next to Hyundai Creta cars, one black and one white',
    es: 'Dos choferes de traje junto a autos Hyundai Creta, uno negro y uno blanco',
  },
  '/fotos/transfer/van-frente.jpg': {
    pt: 'Van executiva preta, uma Mercedes Sprinter, vista de frente',
    en: 'Black executive van, a Mercedes Sprinter, seen from the front',
    es: 'Van ejecutiva negra, una Mercedes Sprinter, vista de frente',
  },
  '/fotos/transfer/van-lateral.jpg': {
    pt: 'Van executiva preta vista de lado',
    en: 'Black executive van seen from the side',
    es: 'Van ejecutiva negra vista de costado',
  },
  '/fotos/transfer/van-porta-lateral-bancos.jpg': {
    pt: 'Bancos de couro da van executiva vistos pela porta lateral',
    en: 'Leather seats of the executive van seen through the side door',
    es: 'Asientos de cuero de la van ejecutiva vistos por la puerta lateral',
  },
  '/fotos/transfer/van-traseira-bagageiro.jpg': {
    pt: 'Bagageiro da van executiva visto pelas portas traseiras abertas',
    en: 'Luggage space of the executive van seen through the open rear doors',
    es: 'Maletero de la van ejecutiva visto por las puertas traseras abiertas',
    'es-ar': 'Baúl de la van ejecutiva visto por las puertas traseras abiertas',
  },
};

/** O texto da foto no idioma; uma foto de fora da lista (a de uma casa, por exemplo) usa o texto reserva. */
export function altDaFoto(foto: string, idioma: Idioma, reserva = ''): string {
  const alt = ALT_FOTOS[foto];
  return alt ? texto(alt, idioma) : reserva;
}
