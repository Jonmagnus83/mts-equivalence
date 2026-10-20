import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  const pages = process.env.GITHUB_PAGES === 'true';
  return {
    base: offline ? './' : pages ? '/mts-equivalence/' : '/',
    plugins: offline ? [viteSingleFile()] : [],
    build: {
      outDir: offline ? 'dist-offline' : 'dist',
      emptyOutDir: true,
      assetsInlineLimit: offline ? 100000000 : 4096,
      cssCodeSplit: !offline,
    },
  };
});
