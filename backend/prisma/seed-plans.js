// backend/prisma/seed-plans.js — popula os planos SaaS no banco
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
    priceMonthly:     29.90,
    priceYearly:      299.00,
    maxUsers:         5,
    maxTransPerMonth: 0, // ilimitado
    maxAccounts:      20,
    maxBudgets:       0, // ilimitado
    features:         [
      'Tudo do Gratuito',
      'Transações ilimitadas',
      'Até 5 membros de equipe',
      'IA e previsão financeira',
      'Exportação de relatórios',
      'OCR de comprovantes',
      'Alertas automáticos',
    ],
  },
  {
    name:             'Business',
    tier:             'BUSINESS',
    priceMonthly:     99.90,
    priceYearly:      999.00,
    maxUsers:         0, // ilimitado
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
  },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where:  { tier: plan.tier },
      update: plan,
      create: plan,
    });
    console.log(`✓ Plano ${plan.name} (${plan.tier}) criado/atualizado`);
  }
  console.log('\nPlanos SaaS configurados com sucesso!');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
