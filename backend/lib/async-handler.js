// backend/lib/async-handler.js — adaptador de handlers assíncronos para o Express 4

/**
 * Envolve um handler async para que rejeições cheguem ao error middleware.
 *
 * O Express 4 só captura exceções síncronas: um `async (req, res) => { throw ... }`
 * devolve uma promise rejeitada que ninguém observa. O resultado é um
 * unhandledRejection — e backend/server.js responde a isso com process.exit(1),
 * então um simples erro de credenciais derrubaria o processo. Encaminhar para
 * `next` faz a AppError virar a resposta HTTP que ela já descreve.
 *
 * @param {Function} fn handler async (req, res, next)
 * @returns {Function} handler seguro para registrar no router
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
