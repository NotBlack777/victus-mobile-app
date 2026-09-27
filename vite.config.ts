import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function cleanVictusHtml(html: string, targetOrigin: string): string {
  let cleaned = html;

  // Next.js App Router (used on victuscloud.com) throws:
  // "Application error: a client-side exception has occurred"
  // when hydrated inside an iframe proxy because window.location does not match
  // Next.js's internal routing manifest.
  const isNextJs =
    cleaned.includes('/_next/static/chunks/') ||
    cleaned.includes('__next_f') ||
    cleaned.includes('next-error-h1');

  if (isNextJs) {
    // 1. Remove all Next.js hydration scripts to prevent client hydration crash
    cleaned = cleaned.replace(
      /<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi,
      ''
    );

    // 2. Remove script chunk preloads to save bandwidth and avoid browser console warnings
    cleaned = cleaned.replace(
      /<link\b[^>]*href=["'][^"']*\/_next\/static\/chunks\/[^"']*["'][^>]*>/gi,
      ''
    );

    // 3. Rewrite _next/image optimized URLs to direct media assets so high-res images load cleanly
    cleaned = cleaned.replace(
      /(\/_next\/image\?url=(?:%2F|\/)([^"'\s&]+)[^"'\s]*)/g,
      (_, __, enc) => `${targetOrigin}/${decodeURIComponent(enc)}`
    );
  }

  // 4. Inject base tag for relative assets (CSS, fonts, images)
  const baseTag = `<base href="${targetOrigin.endsWith('/') ? targetOrigin : targetOrigin + '/'}">`;
  if (cleaned.includes('<head>')) {
    cleaned = cleaned.replace('<head>', `<head>${baseTag}`);
  } else if (cleaned.includes('<head ')) {
    cleaned = cleaned.replace(/<head\b[^>]*>/, (m) => m + baseTag);
  } else {
    cleaned = baseTag + cleaned;
  }

  // 5. Inject client safety and navigation script before </body>
  const helperScript = `
<script>
(function() {
  // Prevent any uncaught exceptions from triggering client error screens
  window.addEventListener('error', function(e) { e.preventDefault(); e.stopPropagation(); }, true);
  window.addEventListener('unhandledrejection', function(e) { e.preventDefault(); }, true);

  // Smooth link handling: open external domains in new window safely
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a && a.href) {
      try {
        var u = new URL(a.href, window.location.href);
        if (u.hostname && !u.hostname.includes('victuscloud.com')) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
      } catch(err) {}
    }
  }, true);
})();
</script>
`;

  if (cleaned.includes('</body>')) {
    cleaned = cleaned.replace('</body>', `${helperScript}</body>`);
  } else {
    cleaned += helperScript;
  }

  return cleaned;
}

function victusProxyPlugin(): Plugin {
  return {
    name: 'victus-live-proxy',
    configureServer(server) {
      server.middlewares.use('/api/website-preview', async (req, res) => {
        try {
          const targetUrl = 'https://victuscloud.com';
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
          });
          const rawHtml = await response.text();
          const html = cleanVictusHtml(rawHtml, 'https://victuscloud.com');

          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=60',
          });
          res.end(html);
        } catch (err: any) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`Failed to load Victus Cloud live preview: ${err?.message || err}`);
        }
      });

      server.middlewares.use('/api/proxy', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', 'http://localhost:3000');
          const target = urlObj.searchParams.get('url') || 'https://victuscloud.com';
          const response = await fetch(target, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
          });
          const rawHtml = await response.text();
          const targetOrigin = new URL(target).origin;
          const html = cleanVictusHtml(rawHtml, targetOrigin);

          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=60',
          });
          res.end(html);
        } catch (err: any) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`Proxy error: ${err?.message || err}`);
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), victusProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
