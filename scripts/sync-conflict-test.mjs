/**
 * sync-conflict-test.mjs — testa o resolvedor de conflito do sync (#2, §6).
 * Puro, sem banco. Rode: node scripts/sync-conflict-test.mjs
 */
import assert from 'node:assert/strict';
import { resolveMutation, resolveBatch } from '../backend/domain/services/sync-conflict.service.js';

let failed = 0;
function t(name, fn) {
  try { fn(); console.log(`[ok] ${name}`); }
  catch (e) { failed++; console.error(`[fail] ${name}: ${e.message}`); }
}

const NOW = Date.parse('2026-07-09T12:00:00Z');
const T1  = '2026-07-09T10:00:00Z'; // mais antigo
const T2  = '2026-07-09T11:00:00Z'; // mais novo
const opt = { now: NOW };

t('inexistente + upsert => create', () => {
  assert.equal(resolveMutation(null, { op: 'upsert', id: 'a', clientUpdatedAt: T1 }, opt).action, 'create');
});
t('inexistente + delete => create-tombstone', () => {
  assert.equal(resolveMutation(null, { op: 'delete', id: 'a', clientUpdatedAt: T1 }, opt).action, 'create-tombstone');
});
t('cliente mais novo + upsert => apply', () => {
  const r = resolveMutation({ id: 'a', updatedAt: T1 }, { op: 'upsert', id: 'a', clientUpdatedAt: T2 }, opt);
  assert.equal(r.action, 'apply');
});
t('cliente mais novo + delete => delete', () => {
  const r = resolveMutation({ id: 'a', updatedAt: T1 }, { op: 'delete', id: 'a', clientUpdatedAt: T2 }, opt);
  assert.equal(r.action, 'delete');
});
t('cliente mais antigo + upsert => server-wins (devolve autoritativo)', () => {
  const ex = { id: 'a', updatedAt: T2, description: 'servidor' };
  const r = resolveMutation(ex, { op: 'upsert', id: 'a', clientUpdatedAt: T1 }, opt);
  assert.equal(r.action, 'server-wins');
  assert.equal(r.record, ex);
});
t('empate de timestamp => server-wins', () => {
  const r = resolveMutation({ id: 'a', updatedAt: T1 }, { op: 'upsert', id: 'a', clientUpdatedAt: T1 }, opt);
  assert.equal(r.action, 'server-wins');
});
t('delete mais antigo => server-wins', () => {
  const r = resolveMutation({ id: 'a', updatedAt: T2 }, { op: 'delete', id: 'a', clientUpdatedAt: T1 }, opt);
  assert.equal(r.action, 'server-wins');
});
t('timestamp no futuro além da margem => reject', () => {
  const r = resolveMutation({ id: 'a', updatedAt: T1 }, { op: 'upsert', id: 'a', clientUpdatedAt: '2026-07-09T13:00:00Z' }, opt);
  assert.equal(r.action, 'reject');
  assert.equal(r.reason, 'timestamp-no-futuro');
});
t('op inválido => reject', () => {
  assert.equal(resolveMutation(null, { op: 'patch', id: 'a', clientUpdatedAt: T1 }, opt).action, 'reject');
});
t('timestamp inválido => reject', () => {
  assert.equal(resolveMutation(null, { op: 'upsert', id: 'a', clientUpdatedAt: 'xx' }, opt).action, 'reject');
});
t('servidor sem updatedAt => cliente tratado como mais novo (apply)', () => {
  const r = resolveMutation({ id: 'a' }, { op: 'upsert', id: 'a', clientUpdatedAt: T1 }, opt);
  assert.equal(r.action, 'apply');
});
t('tombstone + upsert mais novo => apply (resurge legitimamente)', () => {
  const ex = { id: 'a', updatedAt: T1, deletedAt: T1 };
  const r = resolveMutation(ex, { op: 'upsert', id: 'a', clientUpdatedAt: T2 }, opt);
  assert.equal(r.action, 'apply');
});
t('resolveBatch: resolve por opId', () => {
  const existing = { a: { id: 'a', updatedAt: T2 } };
  const muts = [
    { opId: 'o1', op: 'upsert', id: 'a', clientUpdatedAt: T1 }, // server-wins
    { opId: 'o2', op: 'upsert', id: 'b', clientUpdatedAt: T1 }, // create
  ];
  const res = resolveBatch(existing, muts, opt);
  assert.equal(res[0].opId, 'o1'); assert.equal(res[0].action, 'server-wins');
  assert.equal(res[1].opId, 'o2'); assert.equal(res[1].action, 'create');
});
t('resolveBatch aceita Map', () => {
  const m = new Map([['a', { id: 'a', updatedAt: T1 }]]);
  const res = resolveBatch(m, [{ opId: 'o', op: 'delete', id: 'a', clientUpdatedAt: T2 }], opt);
  assert.equal(res[0].action, 'delete');
});

console.log(failed ? `\n${failed} teste(s) falharam` : '\nTodos os testes do resolvedor passaram');
process.exit(failed ? 1 : 0);
