/**
 * chunks/metas.js — chunk sob demanda 'metas' (ADR 0005).
 *
 * Metas, ao abrir a sub-aba do Orçamento. LAZY.load o importa com import() dinâmico
 * (arquivo próprio do Vite no build) e este arquivo publica os módulos em
 * window, como a ponte faz para o boot.
 */
// CSS das telas deste chunk (TELAS.estilo), antes de qualquer módulo desenhar.
import '../../telas/metas.js';
import { METAS } from '../../metas.js';
import { INIT_METAS } from '../../modules/init-metas.js';

window.METAS = METAS;
window.INIT_METAS = INIT_METAS;
