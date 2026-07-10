// backend/lib/open-finance/sandbox.js — transações demo (paridade com frontend)
export const SANDBOX_PROVIDER = 'sandbox';

/**
 * @param {{ bankName?: string }} connection
 * @returns {Array<{ externalId: string, type: string, amount: number, category: string, date: string, description: string }>}
 */
export function fetchSandboxTransactions(connection) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const bank = connection?.bankName || 'Banco Demo';

  return [
    {
      externalId: 'demo-1',
      type: 'despesa',
      amount: 42.5,
      category: 'alimentacao',
      date: `${y}-${m}-14`,
      description: `Open Finance · Mercado (${bank})`,
    },
    {
      externalId: 'demo-2',
      type: 'despesa',
      amount: 19.9,
      category: 'transporte',
      date: `${y}-${m}-16`,
      description: `Open Finance · Mobilidade (${bank})`,
    },
    {
      externalId: 'demo-3',
      type: 'receita',
      amount: 120,
      category: 'reembolsos',
      date: `${y}-${m}-17`,
      description: `Open Finance · Estorno (${bank})`,
    },
  ];
}
