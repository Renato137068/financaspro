/**
 * chunks/onboarding.js — chunk sob demanda 'onboarding' (ADR 0005).
 *
 * O tour de boas-vindas, pedido por Perfil → "Refazer tour". LAZY.load o
 * importa com import() dinâmico (arquivo próprio do Vite no build) e este
 * arquivo o publica em window, como a ponte faz para o boot.
 */
// CSS das telas deste chunk (TELAS.estilo), antes de qualquer módulo desenhar.
import '../../telas/onboarding.js';
import { ONBOARDING } from '../../onboarding.js';

window.ONBOARDING = ONBOARDING;
