/**
 * extrato/acoes.js — ações sobre lançamentos (editar, excluir) e a exportação (Excel/CSV).
 *
 * Parte de INIT_EXTRATO (js/modules/init-extrato.js, que importa todas as
 * partes): cada uma acrescenta seus métodos ao mesmo objeto, criado em
 * extrato/base.js. Os métodos continuam se chamando por INIT_EXTRATO.x.
 */

import { INIT_EXTRATO, _extratoCent } from './base.js';
import { CONFIG } from '../../core/config.js';
import { UTILS } from '../../core/utils.js';
import { TRANSACOES } from '../../transacoes.js';
import { CATEGORIA_VISUAL } from '../../core/categoria-visual.js';
import { RENDER } from '../../render.js';
import { mudarAba } from '../init-navigation.js';
import { INIT_MODALS } from '../init-modals.js';
import { INIT_FORM } from '../init-form.js';
import { BILLING } from '../../billing.js';

Object.assign(INIT_EXTRATO, {

  /**
   * Edita transação
   */
  editarTransacao: function(id) {
    var tx = TRANSACOES.obterPorId(id);
    if (!tx) return;

    // Preencher formulário com dados da transação
    document.getElementById('novo-valor').value = UTILS.formatarMoeda(tx.valor);
    // Decodifica ao preencher o form: sem isso, salvar reescaparia a descrição
    // já escapada, corrompendo o dado a cada edição.
    document.getElementById('novo-descricao').value = UTILS.desescapeHtml(tx.descricao || '');
    document.getElementById('novo-categoria').value = tx.categoria;
    document.getElementById('novo-tipo').value = tx.tipo;
    document.getElementById('novo-data').value = tx.data;
    var tagsEl = document.getElementById('novo-tags');
    if (tagsEl) {
      tagsEl.value = Array.isArray(tx.tags) ? tx.tags.join(', ') : '';
      if (INIT_FORM._renderTagsChips) INIT_FORM._renderTagsChips();
    }

    // Atualizar UI
    INIT_FORM.atualizarTipoIndicator(tx.tipo);
    INIT_FORM.renderCategoriasBtns(tx.tipo);
    INIT_FORM.atualizarOrcamentoPreview();

    // Navegar para aba de edição
    mudarAba('novo');

    // Marcar como edição
    document.getElementById('form-transacao').dataset.editId = id;
    
    // Mudar texto do botão
    var btnReg = document.querySelector('.btn-registrar');
    if (btnReg) btnReg.textContent = 'Atualizar';

    if (typeof INIT_ANEXOS !== 'undefined') {
      INIT_ANEXOS.limparPendentes();
      INIT_ANEXOS.carregarParaTransacao(id);
    }

    UTILS.mostrarToast('Edite a transação e clique em Atualizar', 'info');
  },

  /**
   * Deleta transação
   */
  deletarTransacao: function(id) {
    var self = INIT_EXTRATO;
    INIT_MODALS.confirm('Tem certeza que deseja deletar esta transação?', function() {
      if (!TRANSACOES.obterPorId(id)) return;
      self.state.pendenteExclusao[id] = true;
      self.filtrarExtrato();
      RENDER.init();

      UTILS.agendarExclusao('tx-' + id, function() {
        TRANSACOES.deletar(id);
        delete self.state.pendenteExclusao[id];
        self.filtrarExtrato();
        RENDER.init();
      }, {
        mensagem: 'Excluído',
        duracaoMs: 5000,
        aoDesfazer: function() {
          delete self.state.pendenteExclusao[id];
          self.filtrarExtrato();
          RENDER.init();
        }
      });
    });
  },

  /**
   * Neutraliza fórmulas CSV (= + - @ tab CR) prefixando apóstrofo.
   */
  _neutralizarCsvCelula: function(val) {
    var s = String(val == null ? '' : val);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return s.replace(/"/g, '""');
  },

  /**
   * Exporta extrato para Excel (CSV melhorado)
   */
  exportarExcel: function() {
    // CSV e livre em todos os planos: o dado e do usuario e poder leva-lo
    // embora e argumento de aquisicao ("saia quando quiser"), nao de paywall.

    var info = INIT_EXTRATO.getExtratoMesAno();
    var txs = TRANSACOES.obter({ mes: info.mes, ano: info.ano });
    
    if (txs.length === 0) {
      UTILS.mostrarToast('Nenhuma transação para exportar', 'warning');
      return;
    }

    // Calcular totais
    var receitasC = 0, despesasC = 0;
    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) receitasC += _extratoCent(t.valor);
      // Explícito e não `else`: transferência entre contas não é gasto.
      else if (t.tipo === CONFIG.TIPO_DESPESA) despesasC += _extratoCent(t.valor);
    });
    var receitas = receitasC / 100, despesas = despesasC / 100;
    var saldo = (receitasC - despesasC) / 100;

    var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var mesNome = nomes[info.mes - 1];

    // CSV com BOM para Excel reconhecer UTF-8
    var csv = '\uFEFF'; // BOM
    
    // Header informativo
    csv += 'Extrato FinançasPro\n';
    csv += 'Período: ' + mesNome + ' de ' + info.ano + '\n';
    csv += 'Gerado em: ' + new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR') + '\n';
    csv += '\n';
    
    // Resumo
    csv += 'RESUMO FINANCEIRO\n';
    csv += 'Receitas Total,' + UTILS.formatarMoeda(receitas).replace('R$ ', '') + '\n';
    csv += 'Despesas Total,' + UTILS.formatarMoeda(despesas).replace('R$ ', '') + '\n';
    csv += 'Saldo do Período,' + UTILS.formatarMoeda(saldo).replace('R$ ', '') + '\n';
    csv += '\n';
    
    // Header da tabela
    csv += 'Data,Descrição,Categoria,Tipo,Valor,Saldo Acumulado\n';
    
    // Dados das transações com saldo acumulado
    var saldoAcumulado = 0;
    txs.forEach(function(t) {
      var data = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
      var valor = t.tipo === CONFIG.TIPO_RECEITA ? t.valor : -t.valor;
      saldoAcumulado += valor;
      
      var tipoStr = t.tipo === CONFIG.TIPO_RECEITA ? 'Receita' : 'Despesa';
      var descricao = INIT_EXTRATO._neutralizarCsvCelula(UTILS.desescapeHtml(t.descricao || ''));
      var categoria = INIT_EXTRATO._neutralizarCsvCelula(t.categoria);
      
      csv += data + ',"' + descricao + '","' + categoria + '",' + tipoStr + ',' + valor.toFixed(2) + ',' + saldoAcumulado.toFixed(2) + '\n';
    });

    // Total de transações
    csv += '\nTotal de transações,' + txs.length + '\n';

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'extrato_' + mesNome.toLowerCase() + '_' + info.ano + '.csv';
    link.click();
    
    UTILS.mostrarToast('Planilha exportada', 'success');
  },

  /**
   * Exporta extrato para PDF
   */
  exportarExtrato: function() {
    if (typeof BILLING !== 'undefined' && !BILLING.canUse('exportPdf')) {
      BILLING.onPaymentRequired({
        message: 'O relatório em PDF, pronto para apresentar, está no Pro.',
        gate: 'exportPdf',
      });
      return;
    }
    var info = INIT_EXTRATO.getExtratoMesAno();
    var txs = TRANSACOES.obter({ mes: info.mes, ano: info.ano });
    
    if (txs.length === 0) {
      UTILS.mostrarToast('Nenhuma transação para exportar', 'warning');
      return;
    }

    // Calcular totais
    var receitasC = 0, despesasC = 0;
    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) receitasC += _extratoCent(t.valor);
      // Explícito e não `else`: transferência entre contas não é gasto.
      else if (t.tipo === CONFIG.TIPO_DESPESA) despesasC += _extratoCent(t.valor);
    });
    var receitas = receitasC / 100, despesas = despesasC / 100;
    var saldo = (receitasC - despesasC) / 100;

    var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var mesNome = nomes[info.mes - 1];

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Extrato FinançasPro - ' + mesNome + ' ' + info.ano + '</title>';
    html += '<style>';
    html += '@page { margin: 20mm; size: A4; }';
    html += 'body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; padding: 20px; color: #242a27; }';
    html += '.header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #12694E; padding-bottom: 20px; }';
    html += '.header h1 { color: #12694E; margin: 0 0 10px 0; font-size: 28px; }';
    html += '.header p { color: #6e7a74; margin: 5px 0; font-size: 14px; }';
    html += '.summary { display: flex; justify-content: space-between; margin-bottom: 30px; gap: 20px; }';
    html += '.summary-card { flex: 1; padding: 15px; border-radius: 8px; text-align: center; }';
    html += '.summary-card.receitas { background: #dcfce7; border: 1px solid #86efac; }';
    html += '.summary-card.despesas { background: #fee2e2; border: 1px solid #fca5a5; }';
    html += '.summary-card.saldo { background: #dbeafe; border: 1px solid #93c5fd; }';
    html += '.summary-card h3 { margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #6e7a74; }';
    html += '.summary-card .value { font-size: 24px; font-weight: bold; }';
    html += '.receitas .value { color: #16a34a; }';
    html += '.despesas .value { color: #dc2626; }';
    html += '.saldo .value { color: #2c6e8f; }';
    html += 'table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }';
    html += 'th { background: #f3f5f4; padding: 12px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6e7a74; border-bottom: 2px solid #e5e9e7; }';
    html += 'td { padding: 12px; border-bottom: 1px solid #e5e9e7; font-size: 13px; }';
    html += 'tr:hover { background: #fbfcfb; }';
    html += '.receita { color: #16a34a; font-weight: 600; }';
    html += '.despesa { color: #dc2626; font-weight: 600; }';
    html += '.categoria { font-weight: 500; color: #55605a; }';
    html += '.footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e9e7; text-align: center; color: #98a39d; font-size: 12px; }';
    html += '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }';
    html += '</style>';
    html += '</head><body>';
    
    // Header
    html += '<div class="header">';
    html += '<h1>FinançasPro</h1>';
    html += '<p>Extrato de ' + mesNome + ' de ' + info.ano + '</p>';
    html += '<p>Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR') + '</p>';
    html += '</div>';
    
    // Summary cards
    html += '<div class="summary">';
    html += '<div class="summary-card receitas"><h3>Receitas</h3><div class="value">' + UTILS.formatarMoeda(receitas) + '</div></div>';
    html += '<div class="summary-card despesas"><h3>Despesas</h3><div class="value">' + UTILS.formatarMoeda(despesas) + '</div></div>';
    html += '<div class="summary-card saldo"><h3>Saldo</h3><div class="value">' + UTILS.formatarMoeda(saldo) + '</div></div>';
    html += '</div>';
    
    // Table
    html += '<table>';
    html += '<thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th></tr></thead>';
    html += '<tbody>';
    
    txs.forEach(function(t) {
      var data = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
      var valor = (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + UTILS.formatarMoeda(t.valor);
      var valorClass = t.tipo === CONFIG.TIPO_RECEITA ? 'receita' : 'despesa';
      html += '<tr>';
      html += '<td>' + data + '</td>';
      html += '<td>' + UTILS.escapeHtml(UTILS.desescapeHtml(t.descricao || '')) + '</td>';
      html += '<td class="categoria">' + INIT_EXTRATO.getCatIcon(t.categoria) + ' ' + UTILS.escapeHtml(t.categoria) + '</td>';
      html += '<td>' + (t.tipo === CONFIG.TIPO_RECEITA ? 'Receita' : 'Despesa') + '</td>';
      html += '<td class="' + valorClass + '">' + valor + '</td>';
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    
    // Footer
    html += '<div class="footer">';
    html += '<p>FinançasPro - Controle suas finanças com simplicidade</p>';
    html += '<p>Total de ' + txs.length + ' transações neste período</p>';
    html += '</div>';
    
    html += '</body></html>';

    var win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(function() { win.print(); }, 250);
      UTILS.mostrarToast('Extrato gerado para impressão/PDF', 'success');
    } else {
      UTILS.mostrarToast('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.', 'error');
    }
  },

  /** Ícone da categoria (fonte: CATEGORIA_VISUAL, no bundle principal). */
  getCatIcon: function(cat) {
    return CATEGORIA_VISUAL.icone(cat);
  },

  /** Cor da categoria (fonte: CATEGORIA_VISUAL). */
  getCatCor: function(cat) {
    return CATEGORIA_VISUAL.cor(cat);
  }
});
