/**
 * chunks/simulador.js — chunk sob demanda 'simulador' (ADR 0005).
 *
 * Só ao abrir Perfil → Simulador. A casca do simulador (#simulador-panel,
 * gerada em js/telas/simulador.js) vem aqui, não no chunk 'config':
 * INIT_SIMULADOR.init pode rodar antes de o 'config' chegar.
 */
import '../../telas/simulador.js';
import { SIMULADOR } from '../../simulador.js';
import { INIT_SIMULADOR } from '../../modules/init-simulador.js';

window.SIMULADOR = SIMULADOR;
window.INIT_SIMULADOR = INIT_SIMULADOR;
