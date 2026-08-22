/**
 * retention.test.js — prazo de guarda e resíduo depois da exclusão.
 *
 * Origem: a auditoria de dimensões ocultas procurou o que sobra quando alguém
 * pede para sair e achou duas coisas.
 *
 *   1. Nenhuma tabela tinha prazo. Sessões expiradas, tokens usados e convites
 *      vencidos ficavam para sempre. "Ninguém pediu para apagar" não é base
 *      legal para guardar (LGPD art. 15, IV).
 *   2. `AuditLog` tem relação OPCIONAL com User — ao apagar a conta o Prisma
 *      faz SetNull e a linha permanece, com `ipAddress` e `userAgent` intactos.
 *      Endereço IP é dado pessoal (art. 5º, I). O resultado era dado pessoal
 *      órfão: sem titular para reclamá-lo e sem rotina para apagá-lo.
 *
 * Nenhum dos dois quebra teste de unidade nenhum — são omissões, não erros. Por
 * isso a checagem principal aqui compara o schema contra a política declarada:
 * um modelo novo entra em produção sem prazo e a suíte falha.
 */
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeLogger } from './helpers/mocks.js';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');

let prisma, purgeExpired, RETENTION_POLICY, RETENTION_EXEMPT, UserService;

beforeEach(async () => {
  jest.resetModules();
  prisma = createPrismaFake();

  jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));
  jest.unstable_mockModule('../../backend/lib/logger.js', makeLogger);

  ({ purgeExpired, RETENTION_POLICY, RETENTION_EXEMPT } =
    await import('../../backend/lib/retention.js'));
  ({ UserService } = await import('../../backend/domain/services/user.service.js'));
});

/** Nomes de modelo do schema, no formato do client Prisma (camelCase). */
function modelosDoSchema() {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
    .map(m => m[1])
    .map(n => n[0].toLowerCase() + n.slice(1));
}

const DIA = 86400000;

// ─── a política cobre o schema ───────────────────────────────────────────────
describe('política de retenção — cobertura do schema', () => {
  test('a leitura do schema encontrou modelos', () => {
    // Guarda contra o teste virar vacuamente verde se o regex parar de casar.
    expect(modelosDoSchema().length).toBeGreaterThan(10);
  });

  test('todo modelo do schema tem prazo ou isenção declarada', () => {
    // Este é o teste que faltava. Um modelo novo entra no schema, ninguém
    // pensa em retenção, e o dado se acumula em silêncio até virar incidente.
    const comPrazo = new Set(RETENTION_POLICY.map(r => r.modelo));
    const semDecisao = modelosDoSchema()
      .filter(m => !comPrazo.has(m) && !(m in RETENTION_EXEMPT));

    expect(semDecisao).toEqual([]);
  });

  test('nenhuma isenção aponta para modelo que não existe mais', () => {
    // Isenção órfã depois de um rename dá falsa sensação de cobertura.
    const existentes = new Set(modelosDoSchema());
    const fantasmas = Object.keys(RETENTION_EXEMPT).filter(m => !existentes.has(m));

    expect(fantasmas).toEqual([]);
  });

  test('toda regra declara prazo positivo, campo e motivo', () => {
    const malformadas = RETENTION_POLICY.filter(
      r => !(r.dias > 0) || !r.campo || !r.motivo || r.motivo.length < 30,
    );
    expect(malformadas.map(r => r.modelo)).toEqual([]);
  });

  test('o campo de corte de cada regra existe no modelo do schema', () => {
    // Um campo errado faria o deleteMany não casar nada e o expurgo reportar
    // sucesso apagando zero linhas para sempre.
    const problemas = [];
    for (const regra of RETENTION_POLICY) {
      const nomeModel = regra.modelo[0].toUpperCase() + regra.modelo.slice(1);
      const bloco = schema.match(new RegExp(`model ${nomeModel} \\{([\\s\\S]*?)\\n\\}`));
      if (!bloco) { problemas.push(`${regra.modelo}: modelo não encontrado`); continue; }
      if (!new RegExp(`^\\s*${regra.campo}\\s`, 'm').test(bloco[1])) {
        problemas.push(`${regra.modelo}: campo ${regra.campo} não existe`);
      }
    }
    expect(problemas).toEqual([]);
  });
});

// ─── o expurgo faz o que promete ─────────────────────────────────────────────
describe('purgeExpired', () => {
  const AGORA = new Date('2026-08-10T12:00:00Z');

  /** Cria uma linha com o campo de corte numa data relativa a AGORA. */
  async function linha(modelo, campo, diasAtras, extra = {}) {
    return prisma[modelo].create({
      data: { [campo]: new Date(AGORA.getTime() - diasAtras * DIA), ...extra },
    });
  }

  test('apaga o que passou do prazo e preserva o que não passou', async () => {
    const regra = RETENTION_POLICY.find(r => r.modelo === 'session');

    await linha('session', 'expiresAt', regra.dias + 1);   // vencida
    await linha('session', 'expiresAt', regra.dias - 1);   // dentro do prazo

    await purgeExpired(prisma, AGORA);

    const restantes = await prisma.session.findMany({});
    expect(restantes).toHaveLength(1);
  });

  test('exatamente no limite do prazo ainda não é apagado', async () => {
    // Fronteira importa: `lt` e não `lte` — no dia exato o dado ainda vale.
    const regra = RETENTION_POLICY.find(r => r.modelo === 'session');
    await linha('session', 'expiresAt', regra.dias);

    await purgeExpired(prisma, AGORA);

    expect(await prisma.session.findMany({})).toHaveLength(1);
  });

  test('cada modelo usa seu próprio campo de corte', async () => {
    // auditLog corta por createdAt, session por expiresAt. Trocar os campos
    // apagaria a coisa errada sem erro nenhum.
    const audit = RETENTION_POLICY.find(r => r.modelo === 'auditLog');
    await linha('auditLog', 'createdAt', audit.dias + 1, { action: 'login', resource: 'session' });
    await linha('auditLog', 'createdAt', 1, { action: 'login', resource: 'session' });

    await purgeExpired(prisma, AGORA);

    const restantes = await prisma.auditLog.findMany({});
    expect(restantes).toHaveLength(1);
    expect(restantes[0].action).toBe('login');
  });

  test('devolve o total removido e a contagem por modelo', async () => {
    const regra = RETENTION_POLICY.find(r => r.modelo === 'session');
    await linha('session', 'expiresAt', regra.dias + 5);
    await linha('session', 'expiresAt', regra.dias + 5);

    const out = await purgeExpired(prisma, AGORA);

    expect(out.total).toBe(2);
    expect(out.falhas).toBe(0);
    expect(out.resultados.find(r => r.modelo === 'session').removidos).toBe(2);
  });

  test('rodar duas vezes seguidas não causa dano', async () => {
    const regra = RETENTION_POLICY.find(r => r.modelo === 'session');
    await linha('session', 'expiresAt', regra.dias + 1);

    await purgeExpired(prisma, AGORA);
    const segunda = await purgeExpired(prisma, AGORA);

    expect(segunda.total).toBe(0);
    expect(segunda.falhas).toBe(0);
  });

  test('falha em um modelo não impede o expurgo dos outros', async () => {
    // Um índice travado numa tabela não pode congelar a política inteira.
    // Proxy em vez de spread: o fake do Prisma cria os modelos sob demanda num
    // getter, então `{ ...prisma }` devolveria um objeto sem modelo nenhum — e
    // o teste passaria por acidente, acusando 4 falhas em vez de 1.
    const quebrado = new Proxy(prisma, {
      get(alvo, p) {
        if (p === 'auditLog') {
          return { deleteMany: async () => { throw new Error('deadlock'); } };
        }
        return alvo[p];
      },
    });
    const regra = RETENTION_POLICY.find(r => r.modelo === 'session');
    await prisma.session.create({
      data: { expiresAt: new Date(AGORA.getTime() - (regra.dias + 1) * DIA) },
    });

    const out = await purgeExpired(quebrado, AGORA);

    expect(out.falhas).toBe(1);
    expect(out.resultados.find(r => r.modelo === 'session').removidos).toBe(1);
  });

  test('modelo ausente no client é reportado, não ignorado', async () => {
    // Rename no schema sem atualizar a política: o dado pararia de ser
    // expurgado e nada acusaria.
    const semAudit = new Proxy(prisma, {
      get(alvo, p) { return p === 'auditLog' ? undefined : alvo[p]; },
    });

    const out = await purgeExpired(semAudit, AGORA);

    expect(out.falhas).toBeGreaterThanOrEqual(1);
    expect(out.resultados.find(r => r.modelo === 'auditLog').erro).toMatch(/inexistente/);
  });
});

// ─── resíduo depois da exclusão ──────────────────────────────────────────────
describe('exclusão de conta — resíduo pessoal', () => {
  async function contaCom(logs) {
    await prisma.user.create({ data: { id: 'u1', email: 'a@b.c', name: 'A' } });
    for (const l of logs) {
      await prisma.auditLog.create({
        data: { userId: 'u1', action: 'login', resource: 'session', ...l },
      });
    }
  }

  test('AuditLog é o único modelo com relação opcional a User', () => {
    // Se outro modelo virar opcional, ele passa a sobreviver à exclusão com
    // SetNull e precisa entrar na limpeza — este teste avisa antes.
    const opcionais = [...schema.matchAll(/^\s*user\s+User\?\s+@relation/gm)];
    const blocos = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)]
      .filter(m => /user\s+User\?\s+@relation/.test(m[2]))
      .map(m => m[1]);

    expect(opcionais.length).toBe(1);
    expect(blocos).toEqual(['AuditLog']);
  });

  test('IP e user-agent são apagados dos logs ao excluir a conta', async () => {
    await contaCom([{ ipAddress: '200.1.2.3', userAgent: 'Firefox/1.0' }]);

    await UserService.deleteAccount('u1');

    const [log] = await prisma.auditLog.findMany({});
    expect(log.ipAddress).toBeNull();
    expect(log.userAgent).toBeNull();
  });

  test('metadata livre também é limpa', async () => {
    // Json aberto: qualquer chamador pode ter gravado nome, e-mail ou valor ali.
    await contaCom([{ ipAddress: '1.2.3.4', metadata: { email: 'a@b.c', valor: 500 } }]);

    await UserService.deleteAccount('u1');

    expect((await prisma.auditLog.findMany({}))[0].metadata).toBeNull();
  });

  test('a linha de auditoria em si permanece — é a prova da exclusão', async () => {
    await contaCom([{ ipAddress: '1.2.3.4' }]);

    await UserService.deleteAccount('u1');

    const logs = await prisma.auditLog.findMany({});
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('login');
  });

  test('o resultado informa quantos logs foram anonimizados', async () => {
    await contaCom([{ ipAddress: '1.1.1.1' }, { ipAddress: '2.2.2.2' }]);

    const out = await UserService.deleteAccount('u1');

    expect(out).toMatchObject({ deleted: true, auditLogsAnonymized: 2 });
  });

  test('logs de OUTROS usuários não são tocados', async () => {
    await contaCom([{ ipAddress: '1.1.1.1' }]);
    await prisma.user.create({ data: { id: 'u2', email: 'c@d.e', name: 'B' } });
    await prisma.auditLog.create({
      data: { userId: 'u2', action: 'login', resource: 'session', ipAddress: '9.9.9.9' },
    });

    await UserService.deleteAccount('u1');

    const doOutro = (await prisma.auditLog.findMany({})).find(l => l.userId === 'u2');
    expect(doOutro.ipAddress).toBe('9.9.9.9');
  });

  test('dono de organização é bloqueado com orientação de transferir', async () => {
    await prisma.user.create({ data: { id: 'u1', email: 'a@b.c', name: 'A' } });
    await prisma.organization.create({
      data: { id: 'o1', name: 'Org', slug: 'org', ownerId: 'u1', active: true },
    });

    await expect(UserService.deleteAccount('u1')).rejects.toMatchObject({ status: 409 });
  });

  test('bloqueio por organização não anonimiza nada antes de falhar', async () => {
    // Falhar depois de limpar deixaria a conta viva com o histórico já apagado.
    await contaCom([{ ipAddress: '1.2.3.4' }]);
    await prisma.organization.create({
      data: { id: 'o1', name: 'Org', slug: 'org', ownerId: 'u1', active: true },
    });

    await UserService.deleteAccount('u1').catch(() => {});

    expect((await prisma.auditLog.findMany({}))[0].ipAddress).toBe('1.2.3.4');
  });
});
