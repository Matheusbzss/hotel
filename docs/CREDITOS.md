# Créditos das fotos

As fotos em `public/fotos/` são dos passeios e parceiros da agência, exceto as listadas abaixo, que vieram de bancos de imagem com licença de uso comercial.

| Arquivo | Origem | Autor | Licença |
| --- | --- | --- | --- |
| `buzios/por-do-sol-barcos-na-baia.jpg` | [Unsplash](https://unsplash.com/photos/landscape-photography-of-sailing-boats-during-golden-hour-oOFN-dSZRaE) | Tadeu Jnr | [Unsplash License](https://unsplash.com/license): uso comercial gratuito, sem atribuição obrigatória |

## Fotos de perfil das avaliações

`public/avaliacoes/`: as fotos de perfil de quem avaliou, recortadas dos prints do Tripadvisor que o dono mandou. Não têm licença comercial: o dono decidiu usar por conta dele, em 2026-11-06, sabendo que o certo é ter a autorização de cada pessoa.

## Mapa da página inicial

| Arquivo | Origem | Licença |
| --- | --- | --- |
| `public/mapa/satelite-2048.webp`, `satelite-2880.webp`, `satelite-entorno.webp` | Foto de satélite em cor real do [Copernicus Sentinel-2](https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-2) (ESA), passagens de 18/02/2025 e 16/02/2025, lidas do [AWS Open Data](https://registry.opendata.aws/sentinel-2-l2a-cogs/) pelo catálogo Earth Search (Element 84). Geradas por `scripts/gerar-satelite.mjs` | [Aviso legal dos dados Sentinel](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice): uso livre, inclusive comercial, com o crédito "Contém dados modificados do Copernicus Sentinel 2025" |
| `public/mapa/altura.png` | Terrain Tiles da AWS (dados públicos de elevação, como SRTM). Gerada por `scripts/gerar-relevo.mjs` | Dados públicos, uso livre |
| `src/data/litoral.json`, `lagoas.json`, `praias.json` | OpenStreetMap | © colaboradores do OpenStreetMap, licença ODbL |

O crédito do satélite e do OpenStreetMap aparece na legenda do mapa.

## Logo

| Arquivo | Origem | Licença |
| --- | --- | --- |
| `public/logo/*.svg`, `src/app/icon.svg`, `src/app/apple-icon.png` | Logo da Orla Nativa redesenhada em SVG a partir dos banners da agência por `scripts/gerar-logo.mjs`. As letras usam a fonte [Cinzel](https://fonts.google.com/specimen/Cinzel) (Natanael Gama), convertida em desenho | Logo: da agência. Cinzel: [SIL Open Font License 1.1](https://openfontlicense.org), uso comercial livre |

## Transfer

| Arquivo | Origem | Licença |
| --- | --- | --- |
| `transfer/*.jpg` | Fotos dos veículos da agência, recebidas em 01/11/2026. As placas foram borradas por `scripts/preparar-fotos-transfer.mjs` | Da agência. O casal de `carro-virtus-com-clientes.jpg` autorizou o uso; a foto dos motoristas (`carros-creta-com-motoristas.jpg`) foi liberada pelo dono em 02/11/2026 |

## Casas de temporada

| Arquivo | Origem | Licença |
| --- | --- | --- |
| `casas/mansao-ferradura-vista-mar/*.jpg` | 35 das 38 fotos da casa que o dono mandou em 06/11/2026 (`material-recebido/casas/casa-ferradurinha`). Regravadas sem metadados e com nomes neutros por `scripts/preparar-fotos-casas.ts`; a 34 e a 36 (mostram o portão, a rua e os vizinhos) e a 38 (só decoração) ficaram de fora. Pelo mesmo critério da 36, a 19 (`fachada-e-jardim.jpg`) foi recortada, sem o sobrado vizinho e a casa de telhado vermelho. Em `corredor-de-vidro.jpg` (a 33), a pessoa de pé na beira da piscina, vista pela porta de vidro, foi borrada (sem autorização de imagem). Em `porta-de-entrada.jpg` (a 18) fica o reflexo do fotógrafo no vidro do hall: não dá para reconhecer ninguém | Do anúncio da casa, mandadas pelo dono para anunciar no site. Falta o dono confirmar que o dono do imóvel autoriza o uso |
| `casas/mansao-geriba-vista-mar/*.jpg` | As 50 fotos escolhidas do anúncio da casa que o dono mandou em 07/11/2026 (`material-recebido/casas/casa-geriba`). Regravadas com nomes neutros por `scripts/preparar-fotos-casas.ts` | Do anúncio da casa, mandadas pelo dono para anunciar no site. Falta o dono confirmar que o dono do imóvel autoriza o uso |
