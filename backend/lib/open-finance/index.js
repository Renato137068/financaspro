// backend/lib/open-finance/index.js — registry de provedores Open Finance
import CONFIG from '../../config.js';
import { SANDBOX_PROVIDER, fetchSandboxTransactions } from './sandbox.js';
import { BELVO_PROVIDER, fetchBelvoTransactions, isBelvoConfigured } from './belvo.js';

const providers = {
  [SANDBOX_PROVIDER]: { fetchTransactions: fetchSandboxTransactions },
  [BELVO_PROVIDER]: { fetchTransactions: (conn) => fetchBelvoTransactions(conn.externalLinkId) },
};

/**
 * Retorna adapter do provedor. Belvo/Pluggy entram aqui quando configurados.
 */
export function getProvider(name) {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Provedor Open Finance não suportado: ${name}`);
  }
  return provider;
}

export function getDefaultProviderName() {
  const configured = CONFIG.openFinance?.defaultProvider || SANDBOX_PROVIDER;
  if (configured === 'belvo' && !CONFIG.openFinance?.belvoSecretId) {
    return SANDBOX_PROVIDER;
  }
  if (configured === 'pluggy' && !CONFIG.openFinance?.pluggyClientId) {
    return SANDBOX_PROVIDER;
  }
  return configured;
}

export { SANDBOX_PROVIDER, BELVO_PROVIDER };
