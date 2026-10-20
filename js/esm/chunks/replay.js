/**
 * chunks/replay.js — replay da sessão para o suporte (ADR 0005).
 *
 * Carregado só quando a pessoa pede o replay (Perfil → suporte). LAZY.load o
 * importa e este arquivo publica o módulo em window, como os outros chunks.
 */
import { REPLAY_SESSAO } from '../../services/replay-sessao.js';

window.REPLAY_SESSAO = REPLAY_SESSAO;
