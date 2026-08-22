const { defineConfig } = require('vite');

module.exports = defineConfig({
  // Vanilla JS app: index.html loads the browser scripts directly.
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
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
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
