/**
 * GERADO por scripts/generate-telas.cjs a partir de telas/simulador/<tela>.html — não edite à mão.
 * ES Module (ADR 0005): a entrada do chunk 'simulador' (js/esm/chunks/simulador.js) o importa
 * antes dos módulos da tela.
 */
import { TELAS } from '../core/telas.js';

TELAS.registrar("config-simulador", "<div class=\"perfil-header\">\n<div class=\"perfil-avatar-wrapper\">\n<div class=\"perfil-avatar\" style=\"background: var(--color-primary-500);\" aria-hidden=\"true\"><i data-lucide=\"calculator\"></i></div>\n</div>\n<div class=\"perfil-info\">\n<h2 class=\"perfil-nome\">Simulador financeiro</h2>\n<div class=\"perfil-meta\"><span>Decida com números, sem cadastrar nada</span></div>\n</div>\n<div class=\"perfil-actions\">\n<button class=\"perfil-action-btn\" data-action=\"mudar-aba\" data-aba=\"config\" aria-label=\"Perfil e configurações\">\n<i data-lucide=\"arrow-left\" aria-hidden=\"true\"></i>\n</button>\n</div>\n</div>\n<div class=\"perfil-section\">\n<div id=\"simulador-panel\" class=\"sim-panel\"></div>\n</div>");
