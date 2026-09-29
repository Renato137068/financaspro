/**
 * chunks/patrimonio.js — chunk sob demanda 'patrimonio' (ADR 0005).
 *
 * Patrimônio, ao abrir a sub-aba do Orçamento. LAZY.load o importa com import() dinâmico
 * (arquivo próprio do Vite no build) e este arquivo publica os módulos em
 * window, como a ponte faz para o boot.
 */
import { PATRIMONIO } from '../../patrimonio.js';
import { INIT_PATRIMONIO } from '../../modules/init-patrimonio.js';

window.PATRIMONIO = PATRIMONIO;
window.INIT_PATRIMONIO = INIT_PATRIMONIO;
