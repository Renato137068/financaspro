/**
 * form-autocomplete-perf.test.js — P2.2: debounce + agregação única + invalidação
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'init-form.js'), 'utf8');

describe('P2.2 — debounce e cache de sugestões', function() {
  test('autocomplete faz debounce no input', function() {
    expect(src).toMatch(/_autoDebounceTimer/);
    expect(src).toMatch(/setTimeout\(function\(\)\s*\{[\s\S]*?\},\s*180\)/);
  });

  test('três leitores compartilham _agregarDescricoes', function() {
    expect(src).toMatch(/_agregarDescricoes:\s*function/);
    expect(src).toMatch(/obterSugestoesDescricao:\s*function\(\)\s*\{\s*return INIT_FORM\._agregarDescricoes\(\)\.sugestoes/);
    expect(src).toMatch(/obterTransacoesFrequentes:\s*function\(\)\s*\{\s*return INIT_FORM\._agregarDescricoes\(\)\.frequentes/);
    expect(src).toMatch(/obterDescricoesAnteriores:\s*function\(\)\s*\{\s*return INIT_FORM\._agregarDescricoes\(\)\.descricoes/);
    // Uma única chamada a TRANSACOES.obter dentro do agregador
    const agg = src.match(/_agregarDescricoes:\s*function\s*\(\)\s*\{[\s\S]*?\n  \},/);
    expect(agg).toBeTruthy();
    const obterCalls = (agg[0].match(/TRANSACOES\.obter\s*\(/g) || []).length;
    expect(obterCalls).toBe(1);
  });

  test('_finalizarTransacao invalida o cache de sugestões', function() {
    const fin = src.match(/_finalizarTransacao:\s*function\s*\(\)\s*\{[\s\S]*?\n  \},/);
    expect(fin).toBeTruthy();
    expect(fin[0]).toMatch(/invalidarCacheSugestoes/);
    expect(src).toMatch(/invalidarCacheSugestoes:\s*function[\s\S]*_autocompleteCache\s*=\s*\{\}/);
    expect(src).toMatch(/_aggCache\s*=\s*null/);
  });
});
