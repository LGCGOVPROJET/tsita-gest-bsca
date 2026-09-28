import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Politique CSP du build (docs/SECURITE.md). Aucune ressource externe : polices auto-hébergées (@fontsource),
 * API même origine (/api, /sanctum). À doubler par un en-tête HTTP côté serveur web en production
 * (frame-ancestors n'est pas pris en compte dans une balise meta).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

/** Injecte la CSP en balise meta dans index.html au build uniquement (le serveur de dev Vite utilise des scripts inline). */
function cspMeta(): Plugin {
  return {
    name: 'tsita-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

// La cible du proxy est configurable (VITE_API_TARGET) ; par défaut l'API Laravel TSITA locale (port 8010).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_TARGET || 'http://127.0.0.1:8010';
  return {
    plugins: [react(), cspMeta()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5180,
      strictPort: true,
      headers: SECURITY_HEADERS,
      proxy: {
        '/api': { target, changeOrigin: false },
        '/sanctum': { target, changeOrigin: false },
      },
    },
    // `vite preview` sert le build avec la même politique qu'en production (en-têtes HTTP complets).
    preview: {
      headers: { ...SECURITY_HEADERS, 'Content-Security-Policy': `${CSP}; frame-ancestors 'none'` },
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
