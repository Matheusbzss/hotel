import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // quase todo cliente chega pelo anúncio e abre o site uma vez: vale mais desenhar antes do que guardar o CSS
  experimental: { inlineCss: true },
  // o mapa de cada casa é recortado da foto de satélite na hora, no servidor
  outputFileTracingIncludes: { '/mapa/casas/*': ['./public/mapa/satelite-2880.webp'] },
  // o pacote de passeio + hospedagem saiu do site (Fase 2): quem tiver o link antigo vai para o início
  async redirects() {
    return [
      { source: '/passeio-e-hospedagem', destination: '/', permanent: true },
      { source: '/:idioma(en|es)/passeio-e-hospedagem', destination: '/:idioma', permanent: true },
    ];
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [70, 80],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        // voucher em PDF, calendário das casas e o resto do que o servidor entrega
        source: '/api/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
