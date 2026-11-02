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
- Pagamento por Pix ou cartão (hoje Pagar.me; a troca de provedor é decisão futura do dono). Depois de pagar, recebe voucher com código único, em PDF.
- Preço de venda = preço do parceiro + `MARGEM_PERCENTUAL` (10%). Unidades por pessoa, veículo ou embarcação, com regras de criança por passeio (`src/data/passeios.ts`).
- Existe área administrativa (`/admin`) para acompanhar e marcar reservas.

## Capabilities and Constraints

- Três idiomas: espanhol (prioridade dos anúncios), português (padrão das URLs) e inglês. O espanhol atual usa voseo rioplatense ("reservá", "pagá"); tratamento para o público chileno ainda não decidido.
- O WhatsApp só aparece depois que a compra foi paga: nada de botão flutuante, nem link no checkout ou nas páginas antes disso, para o cliente não chamar achando que consegue preço menor.
- Sem urgência falsa ("últimas vagas"), sem avaliação inventada, sem contagem de clientes inventada.
- Só fotos reais da região e dos passeios. Fotos da internet podem entrar se forem fotos reais, com licença de uso.
- Rodapé só com o e-mail de suporte, sem telefone, razão social, CNPJ nem redes sociais (a empresa não tem redes).
- Casas de temporada (só a casa, ou pacote casa + passeio) ficam prontas mas desligadas (`CASAS_ATIVO = false`); quando ativadas, ganham aba própria no menu.
- Domínio provisório agenciavictorhugo.online; vai mudar para um domínio Orla Nativa.
- Respeitar a opção "reduzir movimento" do sistema.

## Brand Commitments

- Nome: Orla Nativa — Viagens & Passeios.
- O logo atual (sol atrás de duas ondas) será substituído por um logo novo com o nome, a pedido do dono.
- E-mail de suporte: suporte@orlanativa.com.br.

## Evidence on Hand

- 144 fotos reais dos passeios e das cidades em `public/fotos/` (buzios, arraial, cabo-frio, lancha, quadriciclo, rio).
- 28 passeios cadastrados com preços, opções, duração, inclusos e roteiro (`src/data/passeios.ts`).
- Políticas reais: cancelamento, termos de uso e privacidade (`src/content/legal/`).
- Não existem depoimentos, avaliações, números de clientes, imprensa nem perfis em redes sociais. Nada disso pode ser inventado.

## Product Principles

1. Organizar antes de convencer: mostrar o plano inteiro (preço do grupo, horário, busca, política) antes de pedir o pagamento.
2. O lugar de verdade: fotos reais, nomes reais, informação exata.
3. Espanhol primeiro para quem vem do anúncio, sem perder português e inglês.
4. Nenhuma pressão: a confiança vem da clareza, não de contador nem de selo.
5. Celular primeiro: tudo pensado para o polegar e para o 4G.

## Accessibility & Inclusion

Contraste AA, alvos de toque grandes, navegação por teclado e leitor de tela, e o caminho com "reduzir movimento" funcionando de verdade.
