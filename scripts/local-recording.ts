import type { Plugin } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
/** Optional local export for desktop browsers whose download shelf does not save blob links. */
export function localRecording(): Plugin {
  return {
    name: 'facility-local-recording',
    apply: 'serve',
    configureServer(server) {
      const directory = process.env.FACILITY_RECORDING_DIRECTORY;
      if (!directory) return;
      server.middlewares.use('/__facility-recording', async (req, res) => {
        if (
          req.method !== 'POST' ||
          !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(
            req.headers.origin || '',
          )
        ) {
          res.writeHead(403).end();
          return;
        }
        const type = req.headers['content-type'] || '';
        if (!/^video\/(mp4|webm)(;|$)/.test(type)) {
          res.writeHead(415).end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        try {
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 128 * 1024 * 1024) {
              res.writeHead(413).end();
              return;
            }
            chunks.push(chunk);
          }
          await mkdir(directory, { recursive: true });
          await writeFile(
            resolve(
              directory,
              `Seen-Health-Alhambra-Day-in-Motion.${type.includes('mp4') ? 'mp4' : 'webm'}`,
            ),
            Buffer.concat(chunks),
          );
          res.writeHead(201).end('Saved locally');
        } catch {
          res.writeHead(500).end('Unable to save local recording');
        }
      });
    },
  };
}
