import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Configuração para vanilla JS (sem framework)
  root: '.',
  base: '/',
  
  // Entrada principal
  build: {
    // Geração de arquivos com hash para cache busting
    outDir: 'dist',
    assetsDir: 'assets',
    
    // Rollup options
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        // Code splitting automático
        manualChunks: {
          // Vendor libs (quando adicionar)
          // 'vendor': [],
          
          // Core da aplicação
          'core': [
            './js/config.js',
            './js/utils.js',
            './js/dados.js',
            './js/store.js',
            './js/dom-safe.js'
          ],
          
          // Módulos de negócio
          'business': [
            './js/transacoes.js',
            './js/orcamento.js',
            './js/contas.js'
          ],
          
          // Renderização
          'render': [
            './js/render-core.js',
            './js/render-dashboard.js',
            './js/render.js'
          ],
          
          // UI/UX
          'ui': [
            './js/event-bus.js',
            './js/init-navigation.js',
            './js/init-form.js',
            './js/init-extrato.js'
          ]
        },
        
        // Nomeação de arquivos
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          var info = assetInfo.name.split('.');
          var ext = info[info.length - 1];
          if (/\.css$/i.test(assetInfo.name)) {
            return 'css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    },
    
    // Minificação
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    
    // Source maps para debug em produção
    sourcemap: true,
    
    // Target browsers
    target: 'es2015'
  },
  
  // Dev server
  server: {
    port: 3000,
    open: true,
    cors: true
  },
  
  // Otimizações
  optimizeDeps: {
    // Nenhuma dependência externa no momento
    include: []
  },
  
  // Plugins
  plugins: []
});
