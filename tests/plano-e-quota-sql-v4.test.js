/**
 * plano-e-quota-sql-v4.test.js — achados 02, 06 e 07 da auditoria pré-beta.
 *
 * Não sobe banco (isso é `npm run test:db`, pgTAP): trava no repositório o
 * texto das duas migrations, para que a correção não seja desfeita sem alguém
 * ver o teste ficar vermelho.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const ler = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const tierMig = ler('20260906120000_fp_plan_tier_precedencia.sql');
const quotaMig = ler('20260906130000_quota_userconfig_sem_travar.sql');

/* Os cabeçalhos citam o comportamento ANTIGO para explicar a correção. Um
   `not.toMatch` sobre o arquivo inteiro casaria com a citação e reprovaria a
   própria documentação — as asserções negativas olham só o SQL executável. */
const tierSql = tierMig.slice(tierMig.indexOf('create or replace'));
const quotaSql = quotaMig.slice(quotaMig.indexOf('insert into'));

describe('fp_plan_tier — melhor plano vence, não o mais antigo (achado 02)', () => {
  test('ordena por precedência de tier antes de qualquer desempate', () => {
    const ordem = tierSql.slice(tierSql.indexOf('order by'), tierSql.indexOf('limit 1'));
    expect(ordem).toMatch(/case p\.tier/);
    expect(ordem).toMatch(/when 'BUSINESS' then 0/);
    expect(ordem).toMatch(/when 'PRO'\s+then 1/);
    // joinedAt continua existindo, mas só depois — desempate, não critério.
    expect(ordem.indexOf('case p.tier')).toBeLessThan(ordem.indexOf('"joinedAt"'));
  });

  test('não voltou a ordenar só por joinedAt', () => {
    expect(tierSql).not.toMatch(/order by\s+m\."joinedAt" asc\s+limit 1/);
  });

  test('as demais regras de elegibilidade continuam de pé', () => {
    expect(tierMig).toMatch(/o\.active = true/);
    expect(tierMig).toMatch(/s\.status::text = 'ACTIVE'/);
    expect(tierMig).toMatch(/"trialEndsAt" is null or s\."trialEndsAt" > now\(\)/);
    expect(tierMig).toMatch(/return 'FREE';/);
  });

  test('continua STABLE e SECURITY DEFINER com search_path fixo', () => {
    expect(tierMig).toMatch(/stable security definer set search_path = public, pg_temp/);
  });
});

describe('UserConfig — o INSERT não pode trancar a config (achado 07)', () => {
  test('a primeira gravação é aceita como estado herdado', () => {
    expect(quotaMig).toMatch(/if TG_OP = 'INSERT' then\s*\n\s*return NEW;/);
  });

  test('o UPDATE continua recusando aumento nas quatro coleções', () => {
    ['goal', 'bill', 'subscription', 'category'].forEach((kind) => {
      expect(quotaMig).toContain('QUOTA_EXCEEDED:' + kind);
    });
    // A recusa só vale quando estoura E cresceu.
    const ocorrencias = quotaMig.match(/v_new > v_max and v_new > v_old/g) || [];
    expect(ocorrencias).toHaveLength(4);
  });

  test('OLD.data é lido direto — sem o ramo condicional que zerava no INSERT', () => {
    expect(quotaSql).not.toMatch(/case when TG_OP = 'UPDATE'/);
  });

  test('o bypass administrativo continua respeitado', () => {
    expect(quotaMig).toMatch(/fp_quota_bypass\(\)/);
  });

  test('o trigger é recriado sobre a função nova', () => {
    expect(quotaMig).toMatch(/drop trigger if exists trg_fp_userconfig_quota/);
    expect(quotaMig).toMatch(/before insert or update of data on public\."UserConfig"/i);
  });
});

describe('Limites reafirmados de forma idempotente (achado 06)', () => {
  test('reescreve a tabela inteira com on conflict do update', () => {
    expect(quotaMig).toMatch(/insert into public\.fp_plan_limit_config/);
    expect(quotaMig).toMatch(/on conflict \(tier\) do update set/);
  });

  test('cobre as doze colunas numéricas para os três tiers', () => {
    const linhas = quotaMig.match(/\('(FREE|PRO|BUSINESS)',((?:\s*(?:\d+|null),?){12})\)/g) || [];
    expect(linhas).toHaveLength(3);
  });

  test('é a migration de quota mais recente — é ela que o teste de paridade lê', () => {
    const maisRecente = fs.readdirSync(DIR)
      .filter((f) => /quota/.test(f) && f.endsWith('.sql'))
      .sort()
      .pop();
    expect(maisRecente).toBe('20260906130000_quota_userconfig_sem_travar.sql');
  });
});
