/**
 * chunks/metricas.js — linha de base do lançamento (ADR 0005).
 *
 * Carregado no primeiro toque no formulário, e não no boot: mantém o peso
 * inicial do app dentro do orçamento. LAZY.load o importa e este arquivo
 * publica o módulo em window, como os outros chunks.
 */
import { METRICAS_LANCAMENTO } from '../../core/metricas-lancamento.js';

window.METRICAS_LANCAMENTO = METRICAS_LANCAMENTO;
