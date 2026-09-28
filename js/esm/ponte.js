/**
 * ponte.js — entrada dos ES Modules do app (ADR 0005).
 *
 * O app ainda é, na maior parte, uma coleção de scripts clássicos que se
 * enxergam por globais. Os módulos já migrados usam import/export entre si, e
 * esta ponte publica cada um em `window` para quem ainda não migrou.
 *
 * Nenhum módulo daqui pode ler globais de script clássico no carregamento:
 * no build, esta entrada roda antes do app.bundle.js. Só dentro de funções.
 */
import { CONFIG } from '../core/config.js';
import { UTILS } from '../core/utils.js';
import { PASSWORD_POLICY } from '../core/password-policy.js';
import { VALIDATIONS } from '../core/validations.js';
import { FINANCE_CONTRACT } from '../core/finance-contract.js';
import { SYNC_MERGE } from '../core/sync-merge.js';
import { SESSION_LOG } from '../core/session-log.js';
import { IDB_KV } from '../core/idb-kv.js';
import { TELAS } from '../core/telas.js';
import { TablistKeyboard } from '../utilities/tablist-keyboard.js';
import { compartilharTextoUI } from '../utilities/share-texto.js';
import { LAZY } from '../core/lazy-load.js';
import { DOMUTILS } from '../core/domUtils.js';
import { LOCAL_CRYPTO } from '../utilities/local-crypto.js';
import { FUNIL } from '../utilities/funil.js';
import { SCORE } from '../score.js';
import { CATEGORIZADOR } from '../categorizador.js';
import { PARSER } from '../parser.js';
import { APRENDIZADO } from '../aprendizado.js';
import { AUTO_CATEGORIZER, CATEGORIAS } from '../auto-categorizer.js';
import { CATEGORIES } from '../categories.js';
import { TRANSACOES } from '../transacoes.js';
import { ORCAMENTO } from '../orcamento.js';
import { CONTAS } from '../contas.js';
import { CARTOES } from '../cartoes.js';
import { RECORRENTES } from '../recorrentes.js';
import { COMPROMISSOS } from '../compromissos.js';
import { CONTAS_PAGAR } from '../contas-pagar.js';
import { CALENDARIO } from '../calendario.js';
import { PROJECAO } from '../projecao.js';
import { RESUMO_MENSAL } from '../resumo-mensal.js';
import { RESUMO_ANUAL } from '../resumo-anual.js';
import { PLANO_METAS } from '../plano-metas.js';
import { PIPELINE } from '../pipeline.js';
import { AI_ENGINE } from '../ai-engine.js';
import { HEALTH_SERVICE, verificarArmazenamento, verificarBackupAutomatico } from '../services/healthService.js';
import { CATEGORIA_VISUAL } from '../core/categoria-visual.js';
import { TRANSACTION_SERVICE } from '../services/transactionService.js';
import { BUDGET_SERVICE } from '../services/budgetService.js';
import { INSIGHT_ACOES } from '../modules/insight-acoes.js';
import { DADOS_EXPRESS } from '../core/dados-express.js';
import { FORM_SUGESTOES } from '../modules/form-sugestoes.js';

window.CONFIG = CONFIG;
window.UTILS = UTILS;
window.PASSWORD_POLICY = PASSWORD_POLICY;
window.VALIDATIONS = VALIDATIONS;
window.FINANCE_CONTRACT = FINANCE_CONTRACT;
window.SYNC_MERGE = SYNC_MERGE;
window.SESSION_LOG = SESSION_LOG;
window.IDB_KV = IDB_KV;
window.TELAS = TELAS;
window.TablistKeyboard = TablistKeyboard;
window.compartilharTextoUI = compartilharTextoUI;
window.LAZY = LAZY;
window.DOMUTILS = DOMUTILS;
window.LOCAL_CRYPTO = LOCAL_CRYPTO;
window.FUNIL = FUNIL;
window.SCORE = SCORE;
window.CATEGORIZADOR = CATEGORIZADOR;
window.PARSER = PARSER;
window.APRENDIZADO = APRENDIZADO;
window.AUTO_CATEGORIZER = AUTO_CATEGORIZER;
window.CATEGORIAS = CATEGORIAS;
window.CATEGORIES = CATEGORIES;
window.TRANSACOES = TRANSACOES;
window.ORCAMENTO = ORCAMENTO;
window.CONTAS = CONTAS;
window.CARTOES = CARTOES;
window.RECORRENTES = RECORRENTES;
window.COMPROMISSOS = COMPROMISSOS;
window.CONTAS_PAGAR = CONTAS_PAGAR;
window.CALENDARIO = CALENDARIO;
window.PROJECAO = PROJECAO;
window.RESUMO_MENSAL = RESUMO_MENSAL;
window.RESUMO_ANUAL = RESUMO_ANUAL;
window.PLANO_METAS = PLANO_METAS;
window.PIPELINE = PIPELINE;
window.AI_ENGINE = AI_ENGINE;
window.HEALTH_SERVICE = HEALTH_SERVICE;
window.verificarArmazenamento = verificarArmazenamento;
window.verificarBackupAutomatico = verificarBackupAutomatico;
window.CATEGORIA_VISUAL = CATEGORIA_VISUAL;
window.TRANSACTION_SERVICE = TRANSACTION_SERVICE;
window.BUDGET_SERVICE = BUDGET_SERVICE;
window.INSIGHT_ACOES = INSIGHT_ACOES;
window.DADOS_EXPRESS = DADOS_EXPRESS;
window.FORM_SUGESTOES = FORM_SUGESTOES;
