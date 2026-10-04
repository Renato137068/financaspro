/**
 * config-backup.js — backup do Perfil: exportar e importar os dados.
 *
 * Validação do arquivo importado (schema, overrides sensíveis), a mescla da config importada, a exportação com o período dos
 * dados e os orçamentos, e o cálculo de meses entre datas.
 *
 * Saiu de init-config.js (1.746 linhas). Os métodos continuam sendo de
 * INIT_CONFIG: este mixin importa o INIT_CONFIG e se copia para ele com
 * Object.assign ao carregar (o import tem um sentido só, como no
 * FORM_SUGESTOES). Os métodos usam `this` como o INIT_CONFIG.
 *
 * ES Module (ADR 0005): chega sob demanda no chunk 'config'
 * (js/esm/chunks/config.js, via LAZY.load), que o importa.
 */

import { INIT_CONFIG } from './init-config.js';
import { CONFIG } from '../core/config.js';
import { UTILS } from '../core/utils.js';
import { TRANSACOES } from '../transacoes.js';
import { ORCAMENTO } from '../orcamento.js';
import { CONTAS } from '../contas.js';
import { RENDER } from '../render.js';
import { INIT_MODALS } from './init-modals.js';
import { DADOS } from '../core/dados.js';

const CONFIG_BACKUP = {
  /**
   * Valida schema de JSON de importação
   */
  _validateImportSchema: function(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, message: 'Formato inválido: esperado objeto JSON' };
    }
    
    var errors = [];
    
    // Validar transações se existirem
    if (data.transacoes) {
      if (!Array.isArray(data.transacoes)) {
        errors.push('transacoes deve ser um array');
      } else {
        data.transacoes.forEach(function(tx, idx) {
          if (!tx.id) errors.push('transacao[' + idx + ']: id ausente');
          if (typeof tx.valor !== 'number') errors.push('transacao[' + idx + ']: valor inválido');
          if (!tx.data) errors.push('transacao[' + idx + ']: data ausente');
          if (!tx.tipo || !['receita', 'despesa'].includes(tx.tipo)) {
            errors.push('transacao[' + idx + ']: tipo inválido');
          }
          if (!tx.categoria) errors.push('transacao[' + idx + ']: categoria ausente');
        });
      }
    }
    
    // Validar configurações se existirem
    if (data.config && typeof data.config !== 'object') {
      errors.push('config deve ser um objeto');
    }
    
    // Validar orçamentos se existirem
    if (data.orcamentos && typeof data.orcamentos !== 'object') {
      errors.push('orcamentos deve ser um objeto');
    }
    
    if (errors.length > 0) {
      return { valid: false, message: 'Schema inválido: ' + errors.join(', ') };
    }
    
    return { valid: true };
  },

  /** Campos de config que nunca devem ser sobrescritos por importação */
  _IMPORT_CONFIG_BLOCKED: [
    'pinHash', 'pinSalt', 'pinAlgoritmo', 'pinAtivo', 'pinTentativas', 'pinBloqueadoAte'
  ],

  /**
   * Preferências que a importação PODE tocar. Tudo fora da lista é ignorado
   * (ex.: apiBaseUrl, flags de infra, syncV2Enabled).
   * `plano` NÃO entra — entitlement vem da assinatura verificada (RISK-02).
   */
  _IMPORT_CONFIG_ALLOWED: [
    'nome', 'email', 'telefone', 'nascimento', 'endereco', 'cidade',
    'moeda', 'tema', 'alertaOrcamento', 'lembreteDiario', 'obsErrorsEnabled',
    'categoriasCustom', 'bancos', 'cartoes',
    'renda', 'rendaMensal', 'regra503020', 'classificacao503020',
    'ultimoExportoDados', 'ultimoAcessoApp',
    'metas', 'contasPagar', 'assinaturas', 'patrimonio', 'openFinance',
    'onboardingConcluido', 'feedbacks',
    'saldosIniciais', 'faturasPagas', 'faturasDevidas', 'recorrentesProcessadas'
  ],

  /** P1.1: config serializada no backup sem hash/salt/estado do PIN. */
  _configParaExportacao: function() {
    var cfg = Object.assign({}, DADOS.getConfig());
    this._IMPORT_CONFIG_BLOCKED.forEach(function(key) {
      delete cfg[key];
    });
    return cfg;
  },

  _mergeImportedConfig: function(imported) {
    var current = DADOS.getConfig();
    var merged = Object.assign({}, current);
    var allowed = this._IMPORT_CONFIG_ALLOWED;
    var src = imported && typeof imported === 'object' ? imported : {};
    for (var i = 0; i < allowed.length; i++) {
      var key = allowed[i];
      if (Object.prototype.hasOwnProperty.call(src, key)) {
        merged[key] = src[key];
      }
    }
    this._IMPORT_CONFIG_BLOCKED.forEach(function(key) {
      merged[key] = current[key];
    });
    return merged;
  },

  _importTemOverridesSensiveis: function(data) {
    if (!data.config || typeof data.config !== 'object') return false;
    var cfg = data.config;
    // plano do backup é ignorado no merge (RISK-02) — não precisa de aviso.
    if (cfg.pinAtivo || cfg.pinHash || cfg.pinSalt) return true;
    return false;
  },

  /**
   * Configura sistema de importação
   */
  setupImport: function() {
    var area = document.getElementById('import-area');
    var inp = document.getElementById('import-file');
    if (!inp) return;
    
    if (area) {
      area.addEventListener('dragover', function(e) { 
        e.preventDefault(); 
        area.classList.add('drag-over'); 
      });
      area.addEventListener('dragleave', function() { 
        area.classList.remove('drag-over'); 
      });
      area.addEventListener('drop', function(e) {
        e.preventDefault(); 
        area.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) INIT_CONFIG.processarImport(e.dataTransfer.files[0]);
      });
      area.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { 
          e.preventDefault(); 
          inp.click(); 
        }
      });
    }
    inp.addEventListener('change', function() {
      if (this.files[0]) INIT_CONFIG.processarImport(this.files[0]);
      this.value = '';
    });
  },

  /**
   * Processa arquivo de importação
   */
  processarImport: function(file) {
    if (!file) return;
    
    // Validar tipo de arquivo
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      UTILS.mostrarToast('O backup precisa ser um arquivo .json', 'error');
      return;
    }
    
    // Validar tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      UTILS.mostrarToast('Arquivo muito grande (máximo 5MB)', 'error');
      return;
    }
    
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        
        // Validar schema antes de importar
        var schemaValidacao = INIT_CONFIG._validateImportSchema(data);
        if (!schemaValidacao.valid) {
          UTILS.mostrarToast(schemaValidacao.message, 'error');
          return;
        }
        
        INIT_CONFIG._pendingImport = data;
        if (INIT_CONFIG._importTemOverridesSensiveis(data)) {
          INIT_MODALS.confirm(
            'O backup pode alterar preferências. Seu PIN local e o plano de assinatura não serão substituídos. Continuar?',
            function() { INIT_CONFIG.importarDados(INIT_CONFIG._pendingImport); }
          );
        } else {
          INIT_CONFIG.importarDados(data);
        }
      } catch (err) {
        console.error('Erro ao parsear JSON:', err);
        UTILS.mostrarToast('Esse arquivo não parece ser um backup do app. Nada foi alterado.', 'error');
      }
    };
    reader.onerror = function() {
      UTILS.mostrarToast('Não foi possível ler esse arquivo. Nada foi alterado.', 'error');
    };
    reader.readAsText(file);
  },

  /**
   * Importa dados do arquivo
   */
  importarDados: function(data) {
    try {
      var transacoesImportadas = 0;
      var configImportada = false;
      
      // Importar transações
      if (data.transacoes && Array.isArray(data.transacoes)) {
        data.transacoes.forEach(function(tx) {
          if (!tx || !tx.id || !tx.valor || !tx.data || !tx.tipo || !tx.categoria) return;
          var jaExiste = DADOS.getTransacoesRaw().some(function(t) { return t.id === tx.id; });
          if (jaExiste) return;
          DADOS.salvarTransacao(Object.assign({}, tx));
          transacoesImportadas++;
        });
      }
      
      // Importar configurações (PIN local preservado)
      if (data.config && typeof data.config === 'object') {
        var newConfig = INIT_CONFIG._mergeImportedConfig(data.config);
        DADOS.salvarConfig(newConfig);
        configImportada = true;
      }
      
      // Importar contas bancárias ANTES das demais entidades de tela, para que
      // os `contaId` das transações já recém-importadas resolvam para um nome.
      var contasImportadas = 0;
      if (data.contas && Array.isArray(data.contas)) {
        var validas = data.contas.filter(function(c) { return c && c.id && c.nome; });
        if (validas.length) {
          DADOS.salvarContas(validas);
          if (typeof CONTAS !== 'undefined' && CONTAS.init) CONTAS.init();
          contasImportadas = validas.length;
        }
      }

      // Importar orçamentos
      if (data.orcamentos && typeof data.orcamentos === 'object') {
        Object.keys(data.orcamentos).forEach(function(cat) {
          if (data.orcamentos[cat] && data.orcamentos[cat].limite) {
            ORCAMENTO.definirLimite(cat, data.orcamentos[cat].limite);
          }
        });
      }

      // Backups antigos trazem `outbox` e `sync_cursor` do sync v2 da API
      // Express, que saiu (ADR 0007): são ignorados.

      var anexosImportados = 0;
      var importAnexos = Promise.resolve(0);
      if (data.anexos && Array.isArray(data.anexos) && typeof ANEXOS !== 'undefined' && ANEXOS.importarTodos) {
        importAnexos = ANEXOS.importarTodos(data.anexos).then(function(n) { return n; }).catch(function(err) {
          console.warn('Importação de anexos:', err);
          return 0;
        });
      }

      importAnexos.then(function(n) {
        anexosImportados = n || 0;
        if (typeof RENDER !== 'undefined' && RENDER.init) RENDER.init();
        var msg = [];
        if (transacoesImportadas > 0) msg.push(transacoesImportadas + ' transações');
        if (contasImportadas > 0) msg.push(contasImportadas + ' contas');
        if (configImportada) msg.push('configurações');
        if (anexosImportados > 0) msg.push(anexosImportados + ' anexos');
        if (msg.length > 0) {
          UTILS.mostrarToast('Importado: ' + msg.join(', '), 'success');
        } else {
          UTILS.mostrarToast('Não encontrei nada para importar nesse arquivo', 'warning');
        }
      });
      
    } catch (err) {
      console.error('Erro ao importar:', err);
      UTILS.mostrarToast('Não foi possível importar esse arquivo. Nada foi alterado.', 'error');
    }
  },

  /**
   * Exporta todos os dados
   */
  exportarDados: function() {
    var self = this;
    var finalizar = function(anexos) {
      try {
        var exportData = {
          versao: (typeof CONFIG !== 'undefined' ? CONFIG.VERSION : '11.0.0'),
          dataExportacao: new Date().toISOString(),
          transacoes: TRANSACOES.obter({}),
          // Contas bancárias precisam viajar junto: cada transação guarda um
          // `contaId`. Sem elas, todo lançamento restaurado aponta para uma
          // conta inexistente e a coluna de banco no extrato fica em branco —
          // o backup parece completo e não é.
          contas: DADOS.getContas(),
          config: self._configParaExportacao(),
          orcamentos: self.getOrcamentosData(),
          anexos: anexos || [],
          metadados: {
            totalTransacoes: TRANSACOES.obter({}).length,
            totalContas: DADOS.getContas().length,
            totalAnexos: (anexos || []).length,
            periodo: self.getPeriodoDados()
          }
        };

        var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'financaspro_backup_' + new Date().toISOString().split('T')[0] + '.json';
        link.click();

        DADOS.salvarConfig({ ultimoExportoDados: new Date().toISOString() });
        UTILS.mostrarToast('Backup exportado' + ((anexos && anexos.length) ? ' (com anexos)' : ''), 'success');
      } catch (err) {
        console.error('Erro ao exportar:', err);
        UTILS.mostrarToast('Não foi possível exportar. Seus dados continuam salvos aqui.', 'error');
      }
    };

    if (typeof ANEXOS !== 'undefined' && ANEXOS.exportarTodos) {
      ANEXOS.exportarTodos().then(finalizar).catch(function() { finalizar([]); });
    } else {
      finalizar([]);
    }
  },

  /**
   * Obtém dados de orçamentos para exportação
   */
  getOrcamentosData: function() {
    var orcamentos = {};
    var hoje = new Date();
    var mes = hoje.getMonth() + 1;
    var ano = hoje.getFullYear();

    // Percorre TODAS as categorias com limite definido (padrão e personalizadas),
    // não uma lista fixa de 5. Com a lista fixa, o backup perdia em silêncio os
    // orçamentos de educação, assinaturas, viagem, pet, etc. — o arquivo parecia
    // completo e a restauração vinha pela metade. `periodo` usa o mês/ano locais
    // porque obterStatus não devolve esses campos (antes gravava undefined).
    var todos = (typeof ORCAMENTO !== 'undefined' && ORCAMENTO.obterTodos)
      ? ORCAMENTO.obterTodos() : {};
    Object.keys(todos).forEach(function(cat) {
      var status = ORCAMENTO.obterStatus(cat, mes, ano);
      if (status && status.limite) {
        orcamentos[cat] = {
          limite: status.limite,
          gasto: status.gasto,
          periodo: mes + '/' + ano
        };
      }
    });

    return orcamentos;
  },

  /**
   * Obtém metadados do período
   */
  getPeriodoDados: function() {
    var txs = TRANSACOES.obter({});
    if (txs.length === 0) return null;

    // Datas ISO 'YYYY-MM-DD' são ordenáveis como texto — o menor e o maior saem
    // de sort() sem parsear a string como Date, que a leria em UTC e, no fuso do
    // Brasil (UTC-3), jogaria o dia 1º para o mês anterior. calcularMesesEntre lia
    // getMonth() local sobre essa meia-noite UTC e errava a contagem de meses
    // gravada no metadados do backup.
    var datas = txs
      .map(function(t) { return String(t && t.data || '').split('T')[0]; })
      .filter(function(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); })
      .sort();
    if (datas.length === 0) return null;

    var inicio = datas[0];
    var fim = datas[datas.length - 1];
    return {
      inicio: inicio,
      fim: fim,
      meses: this.calcularMesesEntre(inicio, fim)
    };
  },

  /**
   * Calcula meses entre duas datas (inclusive). Aceita string ISO 'YYYY-MM-DD'
   * ou Date; das strings, lê ano/mês por componentes para não depender do fuso.
   */
  calcularMesesEntre: function(data1, data2) {
    function anoMes(d) {
      if (d && typeof d.getFullYear === 'function') return [d.getFullYear(), d.getMonth() + 1];
      var p = String(d).split('T')[0].split('-');
      return [parseInt(p[0], 10), parseInt(p[1], 10)];
    }
    var a = anoMes(data1);
    var b = anoMes(data2);
    var months = (b[0] - a[0]) * 12 + (b[1] - a[1]);
    return Math.abs(months) + 1;
  },
};

Object.assign(INIT_CONFIG, CONFIG_BACKUP);

export { CONFIG_BACKUP };
export default CONFIG_BACKUP;
