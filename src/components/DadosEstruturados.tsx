/** Os dados da página no formato que o Google lê. O "<" vira código para um texto nunca fechar a tag antes da hora. */
export function DadosEstruturados({ dados }: { dados: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, '\\u003c') }} />;
}
