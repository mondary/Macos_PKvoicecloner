import { defineConfig } from 'vite';
export default defineConfig({
  root: 'src/mobile',
  build: { outDir: 'www', emptyOutDir: true, target: 'es2022' },
  server: { port: 5178, strictPort: true },
});
