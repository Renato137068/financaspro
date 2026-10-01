// supabase/functions/_shared/obs-sanitize.js
//
// Sanitiza um relatório de erro vindo do OBS do app antes de gravar em
// public.fp_client_error. JavaScript puro (sem API do Deno) para ser importado
// pela Edge Function `obs-ingest` e testado no Jest
// (tests/backend/obs-sanitize.test.js).
//
// O relatório serve para achar o bug, nunca para saber da vida financeira de
// alguém. Por isso, além dos cortes de tamanho:
//   • só entram chaves de contexto de uma allowlist — o que o app anexar a
//     mais (ids, valores) é descartado aqui;
//   • e-mails viram [email] em todo texto;
//   • na mensagem e no contexto, valores em reais e números com 5+ dígitos
//     viram [valor]/[n] (a pilha mantém os números: linha:coluna do bundle
//     minificado é o que permite achar o erro).

/** Corpo máximo aceito, em caracteres. */
export const LIMITE_CORPO = 8 * 1024;

export const CHAVES_CONTEXTO = ['contexto', 'type', 'line', 'src', 'chave', 'aba'];

const RE_EMAIL = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/gi;
const RE_REAIS = /R\$\s?-?[\d.,]+/g;
const RE_NUMERO_LONGO = /\d{5,}/g;

function semEmail(texto) {
  return String(texto).replace(RE_EMAIL, '[email]');
}

/** Mascara e-mail, valor em reais e números longos (ids, contas, CPF). */
export function mascararTexto(texto) {
  return semEmail(texto).replace(RE_REAIS, '[valor]').replace(RE_NUMERO_LONGO, '[n]');
}

function semQuery(url) {
  return String(url).split(/[?#]/)[0];
}

function textoCortado(valor, max) {
  return typeof valor === 'string' && valor ? valor.slice(0, max) : null;
}

/** Versão do app aceita pelo contador de uso: só X.Y.Z (igual ao CHECK da tabela). */
const RE_VERSAO = /^\d{1,3}\.\d{1,3}\.\d{1,4}$/;

/**
 * Aviso de uso do app (OBS.contarSessao): { kind: 'sessao', app: 'X.Y.Z' }.
 * Só a versão é lida — qualquer outro campo é ignorado, e nada do pedido
 * (IP, user agent, horário) chega ao banco: ele guarda um contador por dia e
 * versão (public.fp_app_sessao_dia).
 *
 * @param {unknown} entrada
 * @returns {string|null} a versão, ou null se não é um aviso de uso válido.
 */
export function versaoDaSessao(entrada) {
  if (!entrada || typeof entrada !== 'object' || entrada.kind !== 'sessao') return null;
  return typeof entrada.app === 'string' && RE_VERSAO.test(entrada.app) ? entrada.app : null;
}

/**
 * @param {unknown} entrada  corpo JSON enviado pelo OBS ({ kind, ts, url, app, data })
 * @param {string|null} userAgent
 * @returns {object|null} linha para fp_client_error, ou null se o corpo não é
 *   um relatório de erro válido (eventos de analytics também são recusados).
 */
export function sanitizarRelatorio(entrada, userAgent) {
  if (!entrada || typeof entrada !== 'object' || entrada.kind !== 'error') return null;
  const dados = entrada.data && typeof entrada.data === 'object' ? entrada.data : {};

  const message = typeof dados.message === 'string'
    ? mascararTexto(dados.message).trim().slice(0, 300)
    : '';
  if (!message) return null;

  const stack = typeof dados.stack === 'string' && dados.stack
    ? semEmail(dados.stack).split('\n').slice(0, 8).join('\n').slice(0, 1500)
    : null;

  const ctxEntrada = dados.context && typeof dados.context === 'object' ? dados.context : {};
  const contexto = {};
  for (const chave of CHAVES_CONTEXTO) {
    const v = ctxEntrada[chave];
    if (typeof v === 'number' && Number.isFinite(v)) {
      contexto[chave] = v;
    } else if (typeof v === 'string' && v) {
      contexto[chave] = mascararTexto(chave === 'src' ? semQuery(v) : v).slice(0, 80);
    }
  }

  return {
    kind: 'error',
    message,
    stack,
    contexto,
    path: typeof entrada.url === 'string' ? semQuery(entrada.url).slice(0, 200) || null : null,
    app_version: textoCortado(entrada.app, 40),
    user_agent: textoCortado(userAgent, 200),
  };
}
