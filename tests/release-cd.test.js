/**
 * release-cd.test.js — a entrega contínua por tag (etapa 4 do roadmap).
 *
 * O workflow só roda quando alguém cria uma tag, com os segredos de produção:
 * um erro nele aparece no pior dia. O que dá para conferir sem publicar nada
 * fica aqui: o deploy do Supabase cobre toda Edge Function e acerta quais
 * sobem sem JWT, a tag tem que ser a versão do app, e o workflow chama
 * scripts que existem, com os segredos que ele documenta.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { funcoes, comandos, SEM_JWT } = require('../scripts/deploy-supabase.cjs');
const { conferir } = require('../scripts/release-tag.cjs');
const { proxima } = require('../scripts/subir-versao.cjs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const workflow = ler('.github/workflows/release.yml');

/** Bloco de um job no YAML (até o próximo job de mesma indentação). */
function job(nome) {
  const ini = workflow.indexOf('\n  ' + nome + ':\n');
  expect(ini).toBeGreaterThan(-1);
  const resto = workflow.slice(ini + 1);
  const fim = resto.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return fim === -1 ? resto : resto.slice(0, fim + 1);
}

describe('deploy do Supabase (scripts/deploy-supabase.cjs)', () => {
  test('publica toda Edge Function com index.ts (nenhuma esquecida)', () => {
    const pastas = fs.readdirSync(path.join(ROOT, 'supabase', 'functions'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name).sort();
    expect(funcoes()).toEqual(pastas);
    expect(funcoes().length).toBeGreaterThanOrEqual(10);
  });

  test('--no-verify-jwt exatamente nas funções que dizem, no próprio código, que precisam dele', () => {
    const pedem = funcoes().filter((f) => ler('supabase/functions/' + f + '/index.ts').includes('--no-verify-jwt'));
    expect(Object.keys(SEM_JWT).sort()).toEqual(pedem.sort());
  });

  test('ordem: vincula, migra, depois publica as funções', () => {
    const lista = comandos({ ref: 'abc' }).map((a) => a.join(' '));
    expect(lista[0]).toBe('link --project-ref abc');
    expect(lista[1]).toBe('db push');
    expect(lista.slice(2)).toHaveLength(funcoes().length);
    expect(lista).toContain('functions deploy stripe-webhook --project-ref abc --no-verify-jwt');
    expect(lista).toContain('functions deploy play-verify --project-ref abc');
    expect(comandos({ ref: 'abc', soFuncoes: true }).map((a) => a[0])).not.toContain('db');
    expect(comandos({ ref: 'abc', soMigracoes: true }).map((a) => a[0])).not.toContain('functions');
  });

  test('sem as variáveis de ambiente, falha avisando quais faltam (e o dry-run não executa nada)', () => {
    const env = Object.assign({}, process.env);
    ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD'].forEach((v) => delete env[v]);
    const real = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'deploy-supabase.cjs')], { env, encoding: 'utf8' });
    expect(real.status).toBe(1);
    expect(real.stderr).toMatch(/SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD/);
    const seco = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'deploy-supabase.cjs'), '--dry-run'], { env, encoding: 'utf8' });
    expect(seco.status).toBe(0);
    expect(seco.stdout).toMatch(/dry-run: nada executado/);
  });
});

describe('tag da release (scripts/release-tag.cjs)', () => {
  test('aceita só vX.Y.Z igual à versão do package.json', () => {
    expect(conferir('v11.3.18', '11.3.18')).toBeNull();
    expect(conferir('v11.3.19', '11.3.18')).toMatch(/não é a versão/);
    expect(conferir('11.3.18', '11.3.18')).toMatch(/formato/);
    expect(conferir('v11.3.18-beta', '11.3.18')).toMatch(/formato/);
    expect(conferir(undefined, '11.3.18')).toMatch(/formato/);
  });
});

describe('subir a versão (scripts/subir-versao.cjs)', () => {
  test('calcula a próxima versão e recusa descer', () => {
    expect(proxima('11.3.18', 'patch')).toBe('11.3.19');
    expect(proxima('11.3.18', 'minor')).toBe('11.4.0');
    expect(proxima('11.3.18', 'major')).toBe('12.0.0');
    expect(proxima('11.3.18', '11.5.0')).toBe('11.5.0');
    expect(() => proxima('11.3.18', 'beta')).toThrow(/patch, minor, major/);
  });

  test('numa cópia do repo: os quatro lugares sobem juntos e o check:version aprova', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-versao-'));
    try {
      ['package.json', 'package-lock.json', 'android/app/build.gradle', 'js/core/config.js', 'sw.js',
        'scripts/check-version-alignment.cjs', 'scripts/subir-versao.cjs'].forEach((rel) => {
        fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel));
      });
      const codeAntes = Number(ler('android/app/build.gradle').match(/versionCode\s+(\d+)/)[1]);
      const nova = proxima(require('../package.json').version, 'patch');
      const r = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'subir-versao.cjs'), 'patch'], {
        env: Object.assign({}, process.env, { FP_RAIZ: tmp }), encoding: 'utf8',
      });
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      const gradle = fs.readFileSync(path.join(tmp, 'android/app/build.gradle'), 'utf8');
      expect(gradle).toContain('versionName "' + nova + '"');
      expect(gradle).toContain('versionCode ' + (codeAntes + 1));
      expect(JSON.parse(fs.readFileSync(path.join(tmp, 'package-lock.json'), 'utf8')).packages[''].version).toBe(nova);
      const check = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'check-version-alignment.cjs')], { encoding: 'utf8' });
      expect(check.stderr).toBe('');
      expect(check.status).toBe(0);
      // Descer não pode: a Play recusa, e o cache do SW não trocaria.
      const volta = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'subir-versao.cjs'), '1.0.0'], {
        env: Object.assign({}, process.env, { FP_RAIZ: tmp }), encoding: 'utf8',
      });
      expect(volta.status).toBe(1);
      expect(volta.stderr).toMatch(/maior que a atual/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('workflow de release (.github/workflows/release.yml)', () => {
  test('dispara por tag vX.Y.Z (e à mão, com a tag)', () => {
    expect(workflow).toMatch(/tags: \['v\*\.\*\.\*'\]/);
    expect(workflow).toMatch(/workflow_dispatch:/);
  });

  test('confere a tag e roda testes, build, orçamento e audit antes de publicar', () => {
    const v = job('verificar');
    ['node scripts/release-tag.cjs', 'npm run check:version', 'npm run lint', 'npm run test:frontend:unit',
      'npm run build', 'npm run check:bundle', 'npm audit --audit-level=high'].forEach((c) => expect(v).toContain(c));
  });

  test('deploy e assinatura exigem o ambiente production; o banco só migra com o AAB pronto', () => {
    expect(job('supabase')).toMatch(/environment: production/);
    expect(job('supabase')).toContain('node scripts/deploy-supabase.cjs');
    // Auditoria de dependências (09/10): um erro no Gradle deixava o banco
    // novo com o app antigo. Agora: AAB → Supabase → publicar.
    expect(job('supabase')).toMatch(/needs: \[verificar, android\]/);
    const p = job('publicar');
    expect(p).toMatch(/environment: production/);
    expect(p).toMatch(/needs: \[verificar, android, supabase\]/);
    expect(p).toContain('gh release create');
    expect(p).toContain('name: aab-${{ needs.verificar.outputs.tag }}');
    const a = job('android');
    expect(a).toMatch(/environment: production/);
    expect(a).toMatch(/needs: verificar\n/);
    expect(a).not.toContain('gh release');
    expect(a).not.toContain('upload-google-play');
    expect(a).toContain("java-version: '21'");
    expect(a).toContain('./gradlew bundleRelease');
    expect(a).toMatch(/grep -q '\^jar verified/);
  });

  test('a keystore não fica no runner e o pacote da Play é o do app', () => {
    const a = job('android');
    expect(a).toMatch(/if: always\(\)\n\s+run: rm -f android\/app\/upload\.jks android\/keystore\.properties/);
    const appId = JSON.parse(ler('capacitor.config.json')).appId;
    expect(job('publicar')).toContain('packageName: ' + appId);
  });

  test('todo script chamado existe, e todo segredo usado está documentado no cabeçalho', () => {
    [...workflow.matchAll(/node (scripts\/[\w-]+\.cjs)/g)].forEach((m) => {
      expect(fs.existsSync(path.join(ROOT, m[1]))).toBe(true);
    });
    const cabecalho = workflow.slice(0, workflow.indexOf('\non:'));
    const usados = new Set([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]));
    expect(usados.size).toBeGreaterThan(5);
    usados.forEach((s) => expect(cabecalho).toContain(s));
  });

  test('a keystore e o keystore.properties seguem fora do git', () => {
    const ignore = ler('.gitignore');
    expect(ignore).toMatch(/\*\.jks/);
    expect(ignore).toMatch(/keystore\.properties/);
  });
});

describe('roteiro para ligar a operação (docs/release/ligar-operacao.md)', () => {
  const roteiro = ler('docs/release/ligar-operacao.md');

  test('cita todo segredo do workflow de release (menos os opcionais de build)', () => {
    const cabecalho = workflow.slice(0, workflow.indexOf('\non:'));
    const segredos = [...cabecalho.matchAll(/\b([A-Z][A-Z0-9_]{5,})\b/g)].map((m) => m[1])
      .filter((s) => !['SUPABASE_URL', 'SUPABASE_ANON_KEY'].includes(s));
    expect(segredos.length).toBeGreaterThan(5);
    segredos.forEach((s) => expect(roteiro).toContain(s));
  });

  test('todo arquivo e toda migração que ele nomeia existem', () => {
    const caminhos = [...roteiro.matchAll(/`((?:docs|scripts|supabase|\.github)\/[\w./-]+)`/g)].map((m) => m[1]);
    expect(caminhos.length).toBeGreaterThan(3);
    caminhos.forEach((c) => expect(fs.existsSync(path.join(ROOT, c))).toBe(true));
    const migracoes = [...roteiro.matchAll(/`(\d{14}_[\w]+)`/g)].map((m) => m[1]);
    expect(migracoes.length).toBeGreaterThanOrEqual(3);
    migracoes.forEach((m) => expect(fs.existsSync(path.join(ROOT, 'supabase/migrations', m + '.sql'))).toBe(true));
  });

  test('o runbook de release aponta para ele', () => {
    expect(ler('docs/release/entrega-continua.md')).toContain('(ligar-operacao.md)');
  });
});

describe('Novidades da versão na loja', () => {
  const pasta = path.join(ROOT, 'distribution/whatsnew');

  test('o release envia a pasta para a Play', () => {
    expect(workflow).toMatch(/whatsNewDirectory:\s*distribution\/whatsnew/);
  });

  test('há texto em português, dentro do limite de 500 caracteres da loja', () => {
    const texto = fs.readFileSync(path.join(pasta, 'whatsnew-pt-BR'), 'utf8').trim();
    expect(texto.length).toBeGreaterThan(40);
    expect(texto.length).toBeLessThanOrEqual(500);
  });

  test('só arquivos whatsnew-<idioma>, que é o que a ação lê', () => {
    fs.readdirSync(pasta).forEach((f) => expect(f).toMatch(/^whatsnew-[a-z]{2}(-[A-Z]{2})?$/));
  });

  test('fala com quem usa, não em termo de commit', () => {
    const texto = fs.readFileSync(path.join(pasta, 'whatsnew-pt-BR'), 'utf8');
    expect(texto).not.toMatch(/\b(fix|feat|chore|refactor)\(|\bcommit\b|\bbug\b/i);
  });
});

describe('portão do release (job verificar)', () => {
  test('roda pgTAP e o smoke no navegador antes de publicar', () => {
    const v = job('verificar');
    expect(v).toMatch(/npm run test:db:ci/);
    expect(v).toMatch(/npm run test:e2e:smoke/);
    expect(v).toMatch(/postgres:16/);
  });
});
