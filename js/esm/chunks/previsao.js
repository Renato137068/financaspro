/**
 * chunks/previsao.js — chunk sob demanda 'previsao' (ADR 0005).
 *
 * LAZY.load('previsao') o importa com import() dinâmico: no build ele vira um
 * arquivo próprio do Vite, fora do boot; no código-fonte, um import nativo.
 * Como a ponte faz para o boot, publica o módulo em window para os scripts
 * clássicos e os guardas `typeof PREVISAO !== 'undefined'`.
 */
import { PREVISAO } from '../../previsao.js';

window.PREVISAO = PREVISAO;
