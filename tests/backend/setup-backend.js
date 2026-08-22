/**
 * setup-backend.js — ambiente para os testes unitários do backend (ESM, node env)
 *
 * Roda antes de qualquer import de backend/config.js, então as variáveis
 * definidas aqui vencem os defaults. PBKDF2 baixo mantém a suíte rápida sem
 * alterar o caminho de código exercitado.
 */

// Aponta o dotenv para um arquivo inexistente ANTES de qualquer import de
// backend/config.js (que faz `import 'dotenv/config'`).
//
// Sem isto, a suíte lia o .env real da máquina de quem rodou. O efeito era
// invisível e traiçoeiro: os `delete process.env.STRIPE_SECRET_KEY` abaixo
// removiam a variável, e então o dotenv — que só respeita valores JÁ definidos —
// a repunha a partir do .env do desenvolvedor. Os quatro testes de "Stripe não
// configurado devolve 503" falhavam na máquina de quem tinha Stripe configurado
// e passavam no CI, que não tem .env. Um teste cujo resultado depende da máquina
// não é um teste — é ruído que ensina a ignorar falha vermelha.
process.env.DOTENV_CONFIG_PATH = '/dev/null/.env.inexistente';

process.env.NODE_ENV = 'test';
process.env.PBKDF2_ITERATIONS = '1000';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.LOGIN_MAX_ATTEMPTS = '3';
process.env.LOGIN_LOCKOUT_MS = '60000';
process.env.APP_URL = 'http://localhost:4000';
process.env.LOG_LEVEL = 'silent';
// Sem Redis e sem Stripe: exercita os caminhos de fallback em memória.
delete process.env.REDIS_URL;
delete process.env.STRIPE_SECRET_KEY;
