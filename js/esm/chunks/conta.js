/**
 * chunks/conta.js — chunk sob demanda 'conta' (ADR 0005).
 *
 * Paywall, compra pela Play (ponte nativa do Capacitor), 2FA e Open Finance:
 * mesmo gatilho (aba Perfil, reconciliação da Play no boot). LAZY.load o
 * importa com import() dinâmico (arquivo próprio do Vite no build) e este
 * arquivo publica os módulos em window, como a ponte faz para o boot.
 *
 * O núcleo do BILLING (cotas, canUse) NÃO vem aqui: é do boot (RISK-01).
 */
// CSS das telas deste chunk (TELAS.estilo), antes de qualquer módulo desenhar.
import '../../telas/conta.js';
import { instalarPonteBillingNativa } from '../../fp-native-billing-bridge.js';
import { PLAY_BILLING } from '../../play-billing.js';
import { INIT_BILLING } from '../../modules/init-billing.js';
import { INIT_2FA } from '../../modules/init-2fa.js';
import { OPEN_FINANCE } from '../../open-finance.js';
import { INIT_OPEN_FINANCE } from '../../modules/init-open-finance.js';

// Antes de publicar: quem recebe o chunk já pode comprar pela Play.
instalarPonteBillingNativa();

window.PLAY_BILLING = PLAY_BILLING;
window.INIT_BILLING = INIT_BILLING;
window.INIT_2FA = INIT_2FA;
window.OPEN_FINANCE = OPEN_FINANCE;
window.INIT_OPEN_FINANCE = INIT_OPEN_FINANCE;
