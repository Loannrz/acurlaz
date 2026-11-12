import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const chemin = (p) => fileURLToPath(new URL(p, import.meta.url));

// Politique de sécurité de la régie (admin/index.html), posée à la construction : GitHub
// Pages ne permet pas d'en-têtes HTTP, elle passe donc par une balise meta. Absente en
// développement, où Vite injecte les styles par script.
function cspRegie(apiUrl) {
  let api = "'none'";
  try {
    api = new URL(apiUrl).origin;
  } catch {
    /* VITE_API_URL absente : la régie affiche un message de configuration */
  }
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    `connect-src ${api}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
  ].join('; ');
  return {
    name: 'acurlaz:csp-regie',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

// Deux pages : le site (index.html) et la régie (admin/index.html), qui ne charge ni three
// ni gsap. Découpage du bundle : three seul ; gsap et lenis ensemble (défilement et animation).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // GitHub Pages sert le site sous /acurlaz/ : le workflow passe BASE_PATH.
    base: process.env.BASE_PATH || '/',
    plugins: [cspRegie(env.VITE_API_URL)],
    build: {
      rollupOptions: {
        input: {
          main: chemin('./index.html'),
          admin: chemin('./admin/index.html'),
        },
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/three\//.test(id)) return 'three';
            if (/node_modules\/(gsap|lenis)\//.test(id)) return 'motion';
            return undefined;
          },
        },
      },
    },
  };
});
