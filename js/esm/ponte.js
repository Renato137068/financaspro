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
window.CATEGORIA_VISUAL = CATEGORIA_VISUAL;
window.TRANSACTION_SERVICE = TRANSACTION_SERVICE;
window.BUDGET_SERVICE = BUDGET_SERVICE;
window.INSIGHT_ACOES = INSIGHT_ACOES;
window.DADOS_EXPRESS = DADOS_EXPRESS;
window.FORM_SUGESTOES = FORM_SUGESTOES;
