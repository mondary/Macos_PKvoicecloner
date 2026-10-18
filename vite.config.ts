import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

/* package.json est la source de vérité de la version : elle est injectée dans
   l'interface (__PK_VERSION__), dans le nom de l'APK et dans son versionName. */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  root: 'src/mobile',
  define: { __PK_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'www', emptyOutDir: true, target: 'es2022' },
  server: { port: 5178, strictPort: true },
});
