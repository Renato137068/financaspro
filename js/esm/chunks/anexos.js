/**
 * chunks/anexos.js — chunk sob demanda 'anexos' (ADR 0005).
 *
 * Anexos de comprovante, ao abrir Novo. LAZY.load o importa com import() dinâmico
 * (arquivo próprio do Vite no build) e este arquivo publica os módulos em
 * window, como a ponte faz para o boot.
 */
import { ANEXOS } from '../../anexos.js';
import { INIT_ANEXOS } from '../../modules/init-anexos.js';

window.ANEXOS = ANEXOS;
window.INIT_ANEXOS = INIT_ANEXOS;
