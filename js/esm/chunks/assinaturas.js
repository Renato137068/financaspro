/**
 * chunks/assinaturas.js — chunk sob demanda 'assinaturas' (ADR 0005).
 *
 * Gastos fixos, ao abrir a sub-aba do Orçamento. LAZY.load o importa com import() dinâmico
 * (arquivo próprio do Vite no build) e este arquivo publica os módulos em
 * window, como a ponte faz para o boot.
 */
import { ASSINATURAS } from '../../assinaturas.js';
import { INIT_ASSINATURAS } from '../../modules/init-assinaturas.js';

window.ASSINATURAS = ASSINATURAS;
window.INIT_ASSINATURAS = INIT_ASSINATURAS;
