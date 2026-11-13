import type { NextConfig } from 'next';

/**
 * Política de segurança do navegador (CSP), em duas partes:
 * - a que já vale: nada de plugin (object), nenhuma outra página muda a base dos links, e o site só abre dentro dele
 *   mesmo (frame-ancestors, o mesmo que o X-Frame-Options);
 * - a completa, só em modo de aviso (Report-Only): o navegador não bloqueia nada, só conta para /api/csp o que
 *   bloquearia. Com os avisos dos primeiros dias (pagamento de teste, anúncios do Google e da Meta), ela passa a valer.
 * As origens da Stripe são as da documentação dela (docs.stripe.com/security/guide: Stripe.js e o checkout embutido);
 * as do Google (gtag dos anúncios) e da Meta (Pixel), as que os scripts deles usam. Sem nonce: as páginas são estáticas,
 * então o script em linha do Next precisa de 'unsafe-inline' (docs do Next, "Without Nonces").
 */
const CSP_QUE_VALE = ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'"].join('; ');
const CSP_EM_AVISO = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com https://*.googletagmanager.com https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.doubleclick.net https://www.google.com https://connect.facebook.net https://www.facebook.com",
  'frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://*.googletagmanager.com https://td.doubleclick.net https://www.facebook.com',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'report-uri /api/csp',
].join('; ');

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
          { key: 'Content-Security-Policy', value: CSP_QUE_VALE },
          { key: 'Content-Security-Policy-Report-Only', value: CSP_EM_AVISO },
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
