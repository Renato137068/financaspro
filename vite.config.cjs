const { defineConfig } = require('vite');

module.exports = defineConfig({
  // Vanilla JS app: index.html loads classic <script defer>. Vite warns those
  // tags aren't Rollup entries — expected; scripts/bundle-app.cjs packs them
  // into app.bundle.js. The one <script type="module"> (js/esm/ponte.js, ADR
  // 0005) IS a Vite entry: it and its imports become js/index-<hash>.js.
  // Heavy features load on demand: ES Module chunks via import() in
  // js/core/lazy-load.js (Vite splits them), classic ones via LAZY_CHUNKS.
  root: '.',
  base: '/',

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && /\.css$/i.test(assetInfo.name)) {
            return 'css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    // Os chunks sob demanda (import() em js/core/lazy-load.js) só importam
    // o que o boot já carregou: pré-carregar dependências não adianta nada, e
    // o helper de modulepreload (e o polyfill) seriam código morto no bundle.
    modulePreload: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        // Igual ao bundle-app.cjs: some com os logs de diagnóstico, mas
        // console.warn/error ficam (último recurso para depurar um relato).
        pure_funcs: ['console.log', 'console.debug', 'console.info', 'console.trace'],
        drop_debugger: true,
      },
    },
    // Sem sourcemap em produção: publicar o mapa junto do bundle entrega o
    // fonte original a qualquer visitante e amplia a superfície de análise sem
    // nenhum benefício para o usuário final.
    sourcemap: false,
    target: 'es2015',
  },

  server: {
    port: 3000,
    open: true,
    cors: true,
  },

  optimizeDeps: { include: [] },
  plugins: [],
});
