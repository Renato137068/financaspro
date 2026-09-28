/**
 * dashboard-renderer.cjs — carrega js/render-dashboard.js num contexto de teste.
 *
 * O renderer é ES Module (ADR 0005) e importa RENDER_CORE, TRANSACOES,
 * ORCAMENTO, SKELETON, UI… Os testes do dashboard montam só o que interessa a
 * eles (UTILS, CONFIG, RENDERER_BASE, um UI falso). O que não montaram fica
 * ausente, como era quando o arquivo lia globais: o dublê é `undefined`, e o
 * módulo real correspondente não roda.
 */
const path = require('path');
const { rodarNoContexto } = require('./esm-como-script.cjs');

const ARQUIVO = path.join(__dirname, '..', '..', 'js', 'render-dashboard.js');
const IMPORTS = ['RENDER_CORE', 'RENDERER_BASE', 'CONFIG', 'UTILS', 'TRANSACOES', 'ORCAMENTO', 'SKELETON', 'UI'];

/** @param {object} ctx contexto vm já criado @returns o RENDER_DASHBOARD */
function carregarDashboard(ctx) {
  IMPORTS.forEach((nome) => {
    if (!Object.prototype.hasOwnProperty.call(ctx, nome)) ctx[nome] = undefined;
  });
  return rodarNoContexto(ctx, ARQUIVO).RENDER_DASHBOARD;
}

module.exports = { carregarDashboard };
