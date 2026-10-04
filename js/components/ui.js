/**
 * ui.js — monta o namespace UI dos componentes de interface.
 *
 * Cada componente é um ES Module que exporta o próprio objeto; os scripts
 * clássicos (render-dashboard, init-extrato) continuam chamando `UI.X`, e é
 * este objeto que js/esm/ponte.js publica como `window.UI`.
 */

import { UI_UTILS } from './_base.js';
import { EmptyState } from './EmptyState.js';
import { ProgressBar } from './ProgressBar.js';
import { ComparacaoMes } from './ComparacaoMes.js';
import { CardTransacao } from './CardTransacao.js';
import { CardOrcamento } from './CardOrcamento.js';
import { AlertaCard } from './AlertaCard.js';
import { LegendaChart } from './LegendaChart.js';
import { BarChart6M } from './BarChart6M.js';
import { DonutChart } from './DonutChart.js';
import { Indicador } from './Indicador.js';

const UI = {
  _utils: UI_UTILS,
  EmptyState: EmptyState,
  ProgressBar: ProgressBar,
  ComparacaoMes: ComparacaoMes,
  CardTransacao: CardTransacao,
  CardOrcamento: CardOrcamento,
  AlertaCard: AlertaCard,
  LegendaChart: LegendaChart,
  BarChart6M: BarChart6M,
  DonutChart: DonutChart,
  Indicador: Indicador
};

export { UI };
export default UI;
