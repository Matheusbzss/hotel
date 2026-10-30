import { notFound } from 'next/navigation';

/** Endereço que não existe dentro de um idioma: mostra a página 404 do site, com cabeçalho e rodapé. */
export default function NaoEncontrada() {
  notFound();
}
