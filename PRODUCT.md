# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Turistas argentinos e chilenos, o público principal, que chegam por anúncio pago e acessam pelo celular (cerca de 90% das visitas). Eles ainda estão em casa, na Argentina ou no Chile, planejando a viagem, e decidem e pagam os passeios antes de chegar ao Brasil. O site também atende brasileiros (português) e quem fala inglês.

## Product Purpose

Vender passeios na Região dos Lagos (Búzios, Arraial do Cabo e Cabo Frio, mais saídas para o Rio de Janeiro) com reserva e pagamento online: escuna, catamarã, lancha, buggy, quadriciclo, mergulho, jet ski, helicóptero, trolley, city tour e full day. Sucesso é o visitante que veio do anúncio fechar a compra no próprio site e receber o voucher na hora.

## Positioning

Praticidade e organização: os passeios da viagem ficam resolvidos de casa, antes de embarcar.
- Preço fechado: o total do grupo aparece antes de pagar, sem surpresa e sem pechincha.
- Tudo pronto antes: paga de casa, recebe o voucher e só embarca, com busca no hotel, horário e ponto de encontro definidos.
- Comprar sem risco: cancelamento grátis até 24 horas antes, reembolso se chover e pagamento seguro.
- Tudo em espanhol: site, voucher e informações no idioma do cliente.

## Operating Context

- O cliente vê o anúncio no celular, entra direto em espanhol e compara passeios, datas e preços antes da viagem.
- Pagamento por cartão, pela Stripe, ou Pix manual com comprovante, a partir das Etapas 4 e 5 da Fase 4. Até lá, o pedido é registrado no site e o pagamento é finalizado com a equipe pelo WhatsApp. Depois de pagar, recebe voucher com código único, em PDF.
- Cada passeio guarda o preço de venda, com unidades por pessoa, veículo ou embarcação e regras de criança (`src/data/passeios.ts`). O ajuste geral e o desconto do Pix ficam em `src/config/precos.ts`.
- Existe área administrativa (`/admin`) para acompanhar e marcar reservas.

## Capabilities and Constraints

- Três idiomas: espanhol (prioridade dos anúncios), português (padrão das URLs) e inglês. O espanhol atual usa voseo rioplatense ("reservá", "pagá"); tratamento para o público chileno ainda não decidido.
- O WhatsApp só aparece depois que a compra foi paga ou depois que o cliente anexou o comprovante do Pix: nada de botão flutuante, nem link no checkout ou nas páginas antes disso, para o cliente não chamar achando que consegue preço menor. O rodapé também não tem ícone do WhatsApp. (Até a Stripe e o Pix manual entrarem no ar, nas Etapas 4 e 5, o pedido ainda fecha pelo WhatsApp.)
- Sem urgência falsa ("últimas vagas"), sem avaliação inventada, sem contagem de clientes inventada.
- Só fotos reais da região e dos passeios. Fotos da internet podem entrar se forem fotos reais, com licença de uso.
- Rodapé com razão social, CNPJ, endereço e e-mail (ORLA NATIVA LTDA, CNPJ 69.664.651/0001-82, Travessa dos Pescadores, 326, Búzios - RJ, CEP 28950-000, financeiro@orlanativa.com), sem telefone. Sem ícones de enfeite: os do Instagram e do WhatsApp, sem link, saíram na revisão para os anúncios (14/11/2026), porque pareciam link quebrado. O do Instagram volta como link de verdade, abrindo em outra aba, quando o endereço oficial chegar (EMPRESA.perfis em src/config/empresa.ts).
- Casas de temporada (só a casa, ou pacote casa + passeio) ficam prontas mas desligadas (`CASAS_ATIVO = false`); quando ativadas, ganham aba própria no menu.
- Domínio oficial orlanativa.online. O antigo, agenciavictorhugo.online, foi desligado em 11/11/2026 por decisão do dono, sem redirecionamento: saiu do projeto da Vercel e os links antigos deixaram de abrir. Ele continua registrado (vence em 29/10/2027), com o DNS na Vercel. Não religar nem pôr redirecionamento sem o dono pedir.
- Respeitar a opção "reduzir movimento" do sistema.

## Brand Commitments

- Nome: Orla Nativa — Viagens & Passeios.
- O logo atual (sol atrás de duas ondas) será substituído por um logo novo com o nome, a pedido do dono.
- E-mail de contato: financeiro@orlanativa.com.

## Evidence on Hand

- 144 fotos reais dos passeios e das cidades em `public/fotos/` (buzios, arraial, cabo-frio, lancha, quadriciclo, rio).
- 28 passeios cadastrados com preços, opções, duração, inclusos e roteiro (`src/data/passeios.ts`).
- Políticas reais: cancelamento, termos de uso e privacidade (`src/content/legal/`).
- Não existem números de clientes nem imprensa, e ainda não há perfil público em redes sociais (o Instagram está em formação). Depoimentos e avaliações, só os reais. Nada disso pode ser inventado.

## Product Principles

1. Organizar antes de convencer: mostrar o plano inteiro (preço do grupo, horário, busca, política) antes de pedir o pagamento.
2. O lugar de verdade: fotos reais, nomes reais, informação exata.
3. Espanhol primeiro para quem vem do anúncio, sem perder português e inglês.
4. Nenhuma pressão: a confiança vem da clareza, não de contador nem de selo.
5. Celular primeiro: tudo pensado para o polegar e para o 4G.

## Accessibility & Inclusion

Contraste AA, alvos de toque grandes, navegação por teclado e leitor de tela, e o caminho com "reduzir movimento" funcionando de verdade.
