// backend/domain/services/play-billing.service.js
//
// Verificação de compras Google Play — entitlement centralizado no backend.
// Quando a conta de serviço está configurada, consulta a Google Play Developer
// API (purchases.subscriptionsv2.get) para obter estado e validade REAIS.
// Sem conta de serviço: produção falha (503); dev usa validade sintética de 30d.
import { BillingRepository } from '../repositories/billing.repository.js';
import { getSubscriptionV2 } from '../../lib/google-play-api.js';
import CONFIG from '../../config.js';

const PRODUCT_TIERS = {
  'financaspro.pro.monthly': 'PRO',
  'financaspro.pro.yearly': 'PRO',
  'financaspro.business.monthly': 'BUSINESS',
  'financaspro.business.yearly': 'BUSINESS',
};

function normalizeToken(token) {
  if (typeof token !== 'string') return null;
  var t = token.trim();
  if (t.length < 20 || t.length > 4096) return null;
  return t;
}

export const PlayBillingService = {
  isConfigured() {
    return !!(CONFIG.playBilling && CONFIG.playBilling.packageName);
  },

  resolveTier(productId) {
    return PRODUCT_TIERS[productId] || null;
  },

  /**
   * Verifica purchaseToken e sincroniza entitlement da organização.
   * @returns {{ tier, productId, expiresAt, restored: boolean }}
   */
  async verifyPurchase(orgId, { productId, purchaseToken, packageName }) {
    var token = normalizeToken(purchaseToken);
    if (!token) {
      var err = new Error('purchase-token-invalido');
      err.status = 400;
      throw err;
    }

    var tier = this.resolveTier(productId);
    if (!tier) {
      var errProd = new Error('produto-desconhecido');
      errProd.status = 400;
      throw errProd;
    }

    var pkg = packageName || (CONFIG.playBilling && CONFIG.playBilling.packageName);
    if (!pkg) {
      var errPkg = new Error('play-billing-nao-configurado');
      errPkg.status = 503;
      throw errPkg;
    }

    // Sandbox/dev: aceita token sintético prefixado para testes automatizados.
    var sandbox = CONFIG.env !== 'production'
      && token.startsWith('GPA.test.');
    var hasServiceAccount = !!(CONFIG.playBilling && CONFIG.playBilling.serviceAccountJson);

    var expiresAt;
    var verifiedProductId = productId;
    var cancelAtPeriodEnd = false;

    if (sandbox) {
      // Testes automatizados: validade sintética, sem tocar na rede.
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (hasServiceAccount) {
      // Verificação REAL contra a Google Play Developer API.
      var sub = await getSubscriptionV2({
        serviceAccountJson: CONFIG.playBilling.serviceAccountJson,
        packageName: pkg,
        purchaseToken: token,
      });
      if (!sub.entitled) {
        var errNa = new Error('assinatura-nao-ativa');
        errNa.status = 402;
        throw errNa;
      }
      // Confia no productId retornado pelo Google (evita cliente pedir tier maior).
      if (sub.productId) {
        var realTier = this.resolveTier(sub.productId);
        if (!realTier) {
          var errRp = new Error('produto-desconhecido');
          errRp.status = 400;
          throw errRp;
        }
        tier = realTier;
        verifiedProductId = sub.productId;
      }
      expiresAt = sub.expiryTime
        || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      cancelAtPeriodEnd = !!sub.cancelAtPeriodEnd;
    } else if (CONFIG.env === 'production') {
      var errApi = new Error('play-api-nao-configurada');
      errApi.status = 503;
      throw errApi;
    } else {
      // Dev sem conta de serviço: validade sintética (conveniência local).
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    var existing = await BillingRepository.findByPlayPurchaseToken(token);

    if (existing && existing.orgId !== orgId) {
      var errDup = new Error('token-em-uso');
      errDup.status = 409;
      throw errDup;
    }

    await BillingRepository.upsertPlayEntitlement(orgId, {
      productId: verifiedProductId,
      purchaseToken: token,
      packageName: pkg,
      tier,
      expiresAt,
      cancelAtPeriodEnd,
      source: 'google_play',
    });

    return {
      tier,
      productId: verifiedProductId,
      expiresAt,
      cancelAtPeriodEnd,
      restored: !!existing,
    };
  },

  async getEntitlement(orgId) {
    return BillingRepository.findPlayEntitlement(orgId);
  },

  /**
   * Reconsulta o estado REAL de um purchaseToken no Google e sincroniza o
   * entitlement da org dona do token: renova (com validade real) ou revoga.
   * Não faz nada destrutivo quando a Google API não está configurada.
   * @returns {{ handled: boolean, reason?: string, orgId?: string, entitled?: boolean, tier?: string|null, expiresAt?: string|null }}
   */
  async syncFromToken(purchaseToken) {
    var token = normalizeToken(purchaseToken);
    if (!token) return { handled: false, reason: 'token-invalido' };

    var owner = await BillingRepository.findByPlayPurchaseToken(token);
    if (!owner) return { handled: false, reason: 'token-desconhecido' };
    var orgId = owner.orgId;

    var hasServiceAccount = !!(CONFIG.playBilling && CONFIG.playBilling.serviceAccountJson);
    if (!hasServiceAccount) {
      // Sem credencial não dá para revalidar; não revoga às cegas.
      return { handled: false, reason: 'api-nao-configurada', orgId: orgId };
    }

    var pkg = CONFIG.playBilling.packageName;
    var sub = await getSubscriptionV2({
      serviceAccountJson: CONFIG.playBilling.serviceAccountJson,
      packageName: pkg,
      purchaseToken: token,
    });

    if (sub.entitled) {
      var tier = sub.productId
        ? this.resolveTier(sub.productId)
        : (owner.subscription && owner.subscription.plan && owner.subscription.plan.tier) || null;
      if (tier) {
        await BillingRepository.upsertPlayEntitlement(orgId, {
          productId: sub.productId,
          purchaseToken: token,
          tier: tier,
          expiresAt: sub.expiryTime,
          cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
        });
      }
      return {
        handled: true,
        orgId: orgId,
        entitled: true,
        tier: tier,
        expiresAt: sub.expiryTime,
        cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
      };
    }

    await BillingRepository.revokePlayEntitlement(orgId, { expiresAt: sub.expiryTime });
    return { handled: true, orgId: orgId, entitled: false, expiresAt: sub.expiryTime };
  },

  /**
   * Processa uma DeveloperNotification (payload já decodificado do RTDN).
   * Só age em notificações de assinatura; test/otherNotification são ignoradas.
   */
  async handleRtdn(notification) {
    var sn = notification && notification.subscriptionNotification;
    if (!sn || !sn.purchaseToken) {
      return { handled: false, reason: 'sem-subscription-notification' };
    }
    return this.syncFromToken(sn.purchaseToken);
  },

  /**
   * Reconciliação periódica do Play (rede de segurança para RTDN perdido).
   * O token completo não é persistido (apenas o prefixo vira chave), então não
   * há como reconsultar o Google no worker; o que dá para corrigir localmente é
   * revogar entitlements cujo período pago já expirou mas seguem ACTIVE — caso
   * a notificação de expiração tenha se perdido.
   * @returns {{ swept: number, revoked: number }}
   */
  async reconcileExpiries() {
    var rows = await BillingRepository.findPlayLinkedSubscriptions();
    var agora = Date.now();
    var revoked = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var vencido = row.currentPeriodEnd && new Date(row.currentPeriodEnd).getTime() < agora;
      if (vencido && row.status === 'ACTIVE') {
        await BillingRepository.revokePlayEntitlement(row.orgId, { expiresAt: row.currentPeriodEnd });
        revoked++;
      }
    }
    return { swept: rows.length, revoked: revoked };
  },
};
