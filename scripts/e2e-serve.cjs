/**
 * e2e-serve.cjs — servidor estático para Playwright webServer
 */
const { ensureBuild, startStaticServer, DEFAULT_PORT } = require('./e2e-fixtures.cjs');

ensureBuild();

startStaticServer(DEFAULT_PORT).then(function() {
  console.log('[e2e-serve] http://127.0.0.1:' + DEFAULT_PORT);
});

process.on('SIGINT', function() { process.exit(0); });
process.on('SIGTERM', function() { process.exit(0); });
