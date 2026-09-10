// backend/prisma/seed-plans.js — popula os planos SaaS no banco
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function stripeIds(tier) {
  if (tier === 'FREE') return {};
  return {
    stripePriceIdMonthly: process.env['STRIPE_PRICE_' + tier + '_MONTHLY'] || null,
    stripePriceIdYearly:  process.env['STRIPE_PRICE_' + tier + '_YEARLY'] || null,
  };
}

const PLANS = [
  {
    name:             'Gratuito',
    tier:             'FREE',
    priceMonthly:     0,
    priceYearly:      0,
    maxUsers:         1,
    maxTransPerMonth: 100,
    maxAccounts:      3,
    maxBudgets:       5,
    features:         ['Transações básicas', 'Orçamentos', 'Relatórios simples'],
  },
  {
    name:             'Pro',
    tier:             'PRO',
    priceMonthly:     16.99,
    // 129,99 = ~36% de desconto sobre 12 x 16,99 (203,88). Tiers do Play
    // (nao aceita 16,90). Pro e individual/casal (2 membros); colaboracao
    // de time e o gancho exclusivo do Business.
    priceYearly:      129.99,
    maxUsers:         2,
    maxTransPerMonth: 0,
    maxAccounts:      20,
    maxBudgets:       0,
    features:         [
      'Tudo do Gratuito',
      'Transações ilimitadas',
      'Casal — até 2 membros',
      'IA e previsão financeira',
      'Exportação de relatórios',
      'Alertas automáticos',
    ],
    ...stripeIds('PRO'),
  },
  {
    name:             'Business',
    tier:             'BUSINESS',
    priceMonthly:     79.90,
    priceYearly:      799.00,
    maxUsers:         0,
    maxTransPerMonth: 0,
    maxAccounts:      0,
    maxBudgets:       0,
    features:         [
      'Tudo do Pro',
      'Membros ilimitados',
      'Múltiplas organizações',
      'API access',
      'Suporte prioritário',
      'Relatórios customizados',
      'Auditoria completa',
    ],
    ...stripeIds('BUSINESS'),
  },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where:  { tier: plan.tier },
      update: plan,
      create: plan,
    });
    const stripe = plan.tier !== 'FREE'
      ? ` (Stripe: ${plan.stripePriceIdMonthly || '—'})`
      : '';
    console.log(`✓ Plano ${plan.name} (${plan.tier}) criado/atualizado${stripe}`);
  }
  console.log('\nPlanos SaaS configurados com sucesso!');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
