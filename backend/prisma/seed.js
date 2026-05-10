// backend/prisma/seed.js — dados iniciais para desenvolvimento
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes, pbkdf2Sync } from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password, saltHex) {
  return pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 100000, 32, 'sha256').toString('hex');
}

async function main() {
  console.log('Seeding banco de dados...');

  // Usuário admin
  const salt = randomBytes(16).toString('hex');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@financaspro.dev' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@financaspro.dev',
      passwordSalt: salt,
      passwordHash: hashPassword('Admin@123', salt),
      role: 'ADMIN',
    },
  });

  // Usuário demo
  const salt2 = randomBytes(16).toString('hex');
  const demo = await prisma.user.upsert({
    where: { email: 'demo@financaspro.dev' },
    update: {},
    create: {
      name: 'Usuário Demo',
      email: 'demo@financaspro.dev',
      passwordSalt: salt2,
      passwordHash: hashPassword('demo123', salt2),
      role: 'USER',
    },
  });

  // Conta bancária do demo
  const conta = await prisma.account.upsert({
    where: { id: 'seed-account-1' },
    update: {},
    create: {
      id: 'seed-account-1',
      userId: demo.id,
      name: 'Conta Corrente',
      type: 'checking',
      balance: 5000,
      institution: 'Banco Demo',
    },
  });

  // Transações de exemplo
  const now = new Date();
  await prisma.transaction.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-tx-1',
        userId: demo.id,
        accountId: conta.id,
        type: 'receita',
        amount: 5000,
        description: 'Salário',
        category: 'Renda',
        date: new Date(now.getFullYear(), now.getMonth(), 5),
        tags: ['salário'],
      },
      {
        id: 'seed-tx-2',
        userId: demo.id,
        accountId: conta.id,
        type: 'despesa',
        amount: 1200,
        description: 'Aluguel',
        category: 'Moradia',
        date: new Date(now.getFullYear(), now.getMonth(), 10),
        tags: ['fixo'],
      },
      {
        id: 'seed-tx-3',
        userId: demo.id,
        type: 'despesa',
        amount: 450,
        description: 'Supermercado',
        category: 'Alimentação',
        date: new Date(now.getFullYear(), now.getMonth(), 15),
        tags: [],
      },
    ],
  });

  // Orçamentos
  await prisma.budget.createMany({
    skipDuplicates: true,
    data: [
      { userId: demo.id, category: 'Alimentação', limit: 600, period: 'monthly' },
      { userId: demo.id, category: 'Moradia', limit: 1500, period: 'monthly' },
      { userId: demo.id, category: 'Lazer', limit: 300, period: 'monthly' },
    ],
  });

  console.log(`✓ Admin: ${admin.email}`);
  console.log(`✓ Demo: ${demo.email} (senha: demo123)`);
  console.log('Seed concluído!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
