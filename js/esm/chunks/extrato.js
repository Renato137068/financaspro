/**
 * chunks/extrato.js — chunk sob demanda 'extrato' (ADR 0005).
 *
 * Ao abrir a aba ou por um wrapper global (exportar, editar pelo alerta, "ver
 * no extrato"). LAZY.load o importa com import() dinâmico (arquivo próprio do
 * Vite no build). A tela gerada (js/telas/extrato.js) vem primeiro: quando o
 * init roda, o markup já está no DOM.
 */
import '../../telas/extrato.js';
import { INIT_EXTRATO } from '../../modules/init-extrato.js';

window.INIT_EXTRATO = INIT_EXTRATO;
