// backend/lib/tracer.js — trace context via AsyncLocalStorage
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

const als = new AsyncLocalStorage();

/**
 * Executa fn dentro de um contexto de trace isolado.
 * Toda chamada assíncrona disparada dentro de fn herda automaticamente o contexto.
 */
export function runWithTraceContext(ctx, fn) {
  return als.run(ctx, fn);
}

/** Retorna o contexto de trace da requisição atual, ou null fora de uma request. */
export function getTraceContext() {
  return als.getStore() ?? null;
}

/**
 * Inicia um span para medir a duração de uma operação interna.
 * Uso:
 *   const span = startSpan('db.query');
 *   // ... operação ...
 *   const ms = span.end(); // retorna duração em ms
 */
export function startSpan(name) {
  const ctx = getTraceContext();
  const startNs = process.hrtime.bigint();
  return {
    traceId: ctx?.traceId ?? null,
    spanId: randomUUID().slice(0, 8),
    name,
    end() {
      return Number(process.hrtime.bigint() - startNs) / 1_000_000;
    },
  };
}
