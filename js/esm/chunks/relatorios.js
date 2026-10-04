/**
 * chunks/relatorios.js — chunk sob demanda 'relatorios' (ADR 0005).
 *
 * Relatórios (cálculo e tela). LAZY.load o importa com import() dinâmico
 * (arquivo próprio do Vite no build) e este arquivo os publica em window,
 * como a ponte faz para o boot.
 */
// CSS das telas deste chunk (TELAS.estilo), antes de qualquer módulo desenhar.
import '../../telas/relatorios.js';
import { RELATORIOS } from '../../relatorios.js';
import { INIT_RELATORIOS } from '../../modules/init-relatorios.js';

window.RELATORIOS = RELATORIOS;
window.INIT_RELATORIOS = INIT_RELATORIOS;
