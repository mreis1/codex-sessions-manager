import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify';
import fs from 'fs';
import path from 'path';

const sessionsIndex = () => ({
  name: 'sessions-index',
  configureServer(server) {
    const parseJsonBlocks = (raw) => {
      const blocks = [];
      let buffer = [];
      let depth = 0;

      const flush = () => {
        if (!buffer.length) return;
        const block = buffer.join('\n').trim();
        buffer = [];
        if (!block) return;
        blocks.push(JSON.parse(block));
      };

      for (const line of (raw || '').split('\n')) {
        if (!buffer.length && !line.trim()) continue;
        const clean = line.replace(/"(?:\\.|[^"\\])*"/g, '');
        depth += (clean.match(/{/g) || []).length;
        depth -= (clean.match(/}/g) || []).length;
        if (depth < 0) throw new Error('Malformed JSONL structure');

        buffer.push(line);
        if (depth === 0) flush();
      }

      if (depth !== 0) throw new Error('Malformed JSONL structure');
      flush();
      return blocks;
    };

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

    server.middlewares.use('/__sessions_relocate', (req, res) => {
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
          const relPath = typeof parsed.path === 'string' ? parsed.path : '';
          const newWorkdir = typeof parsed.newWorkdir === 'string' ? parsed.newWorkdir.trim() : '';
          if (!relPath.endsWith('.jsonl') || !newWorkdir) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Invalid input' }));
            return;
          }

          const baseRoot = path.resolve(root());
          const target = path.resolve(baseRoot, relPath);
          if (!target.startsWith(`${baseRoot}${path.sep}`) && target !== baseRoot) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Invalid path' }));
            return;
          }

          if (!fs.existsSync(target)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Session file not found' }));
            return;
          }

          const raw = fs.readFileSync(target, 'utf8');
          const blocks = parseJsonBlocks(raw);
          let updatedCount = 0;

          const rewritten = blocks.map((entry) => {
            if (!entry || typeof entry !== 'object' || !entry.payload || typeof entry.payload !== 'object') {
              return entry;
            }

            const payload = { ...entry.payload };
            let changed = false;

            if (typeof payload.cwd === 'string') {
              payload.cwd = newWorkdir;
              changed = true;
            }
            if (typeof payload.workdir === 'string') {
              payload.workdir = newWorkdir;
              changed = true;
            }

            if (changed) {
              updatedCount += 1;
              return { ...entry, payload };
            }
            return entry;
          });

          const nextRaw = rewritten.map((entry) => JSON.stringify(entry, null, 2)).join('\n\n') + '\n';
          fs.writeFileSync(target, nextRaw, 'utf8');

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, updatedCount }));
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
