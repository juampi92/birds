import { relative, sep } from 'node:path';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig, type ResolvedConfig, type ViteDevServer } from 'vite';
import { generateMediaManifest } from './scripts/media/generate-media-manifest.mjs';

function mediaManifestPlugin() {
  let projectRoot = process.cwd();
  let regeneration: Promise<void> = Promise.resolve();

  function isMediaSource(file: string): boolean {
    const path = relative(projectRoot, file).split(sep).join('/');
    return (
      path === 'static/media/catalog.json' ||
      path.startsWith('static/media/photos/') ||
      path.startsWith('static/media/sounds/')
    );
  }

  function queueRegeneration(server: ViteDevServer): void {
    regeneration = regeneration
      .catch(() => {})
      .then(async () => {
        await generateMediaManifest(projectRoot);
        server.ws.send({ type: 'full-reload' });
      });
    regeneration.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      server.config.logger.error('[media-manifest] ' + message);
    });
  }

  return {
    name: 'birds-media-manifest',
    apply: 'serve' as const,
    configResolved(config: ResolvedConfig): void {
      projectRoot = config.root;
    },
    async buildStart(): Promise<void> {
      await generateMediaManifest(projectRoot);
    },
    configureServer(server: ViteDevServer): void {
      const onMediaChange = (file: string): void => {
        if (isMediaSource(file)) queueRegeneration(server);
      };
      server.watcher.on('add', onMediaChange);
      server.watcher.on('change', onMediaChange);
      server.watcher.on('unlink', onMediaChange);
    }
  };
}

export default defineConfig({ plugins: [mediaManifestPlugin(), sveltekit(), svelteTesting()] });
