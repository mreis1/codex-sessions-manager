import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify';
import fs from 'fs';
import path from 'path';

const sessionsIndex = () => ({
  name: 'sessions-index',
  configureServer(server) {
    const root = () =>
      process.env.SESSIONS_ROOT_PATH ||
      path.resolve(process.cwd(), 'sessions');

    server.middlewares.use('/__sessions_index', (req, res) => {
      const baseRoot = root();

      const files = [];
      const walk = (dir, base) => {
        const entries = fs.existsSync(dir)
          ? fs.readdirSync(dir, { withFileTypes: true })
          : [];
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const rel = path.relative(base, full).replace(/\\/g, '/');
          if (entry.isDirectory()) {
            walk(full, base);
          } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            files.push({
              rel,
              url: `/sessions/${rel}`,
            });
          }
        }
      };

      walk(baseRoot, baseRoot);

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(files));
    });

    server.middlewares.use('/__sessions_delete', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const inputPaths = Array.isArray(parsed.paths) ? parsed.paths : [];
          const baseRoot = path.resolve(root());

          const removed = [];
          const failed = [];

          for (const relPath of inputPaths) {
            if (typeof relPath !== 'string' || !relPath.endsWith('.jsonl')) {
              failed.push(relPath);
              continue;
            }

            const target = path.resolve(baseRoot, relPath);
            if (!target.startsWith(`${baseRoot}${path.sep}`) && target !== baseRoot) {
              failed.push(relPath);
              continue;
            }

            if (!fs.existsSync(target)) {
              continue;
            }

            try {
              fs.unlinkSync(target);
              removed.push(relPath);
            } catch {
              failed.push(relPath);
            }
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, removed, failed }));
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
        }
      });
    });
  },
});

export default defineConfig({
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    vuetify(),
    sessionsIndex(),
  ],
  server: {
    host: process.env.VITE_HOST || '0.0.0.0',
    port: Number(process.env.VITE_PORT) || 5172,
    strictPort: true,
    watch: {
      ignored: ['**/sessions/**'],
    },
  },
  envPrefix: ['VITE_', 'SESSIONS_'],
});
