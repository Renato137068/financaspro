/**
 * chunks/config.js — chunk sob demanda 'config' (ADR 0005).
 *
 * O Perfil e suas sub-telas, ao abrir qualquer aba config-* ou por um wrapper
 * global (editar perfil, bancos, categorias, exportar backup). LAZY.load o
 * importa com import() dinâmico. As telas geradas vêm primeiro; os mixins de
 * backup e de bancos se copiam para o INIT_CONFIG ao carregar.
 */
import '../../telas/config.js';
import { INIT_CONFIG } from '../../modules/init-config.js';
import { CONFIG_BACKUP } from '../../modules/config-backup.js';
import { CONFIG_BANCOS } from '../../modules/config-bancos.js';
import { EXCLUIR_CONTA } from '../../modules/excluir-conta.js';

window.INIT_CONFIG = INIT_CONFIG;
window.CONFIG_BACKUP = CONFIG_BACKUP;
window.CONFIG_BANCOS = CONFIG_BANCOS;
window.EXCLUIR_CONTA = EXCLUIR_CONTA;
