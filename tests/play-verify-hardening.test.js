/**
 * play-verify-hardening.test.js — achados 03, 04 e 05 da auditoria pré-beta.
 *
 * A verificação de compra é o único ponto onde dinheiro vira permissão. Estes
 * testes leem o fonte da Edge Function e as regras do ProGuard: não substituem
 * um teste de compra ponta a ponta na faixa de testes do Play, mas travam as
 * três decisões que não podem ser desfeitas sem alguém perceber.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const playBilling = read('supabase/functions/_shared/play-billing.ts');

/* Os comentários citam o código ANTIGO para explicar por que ele saiu. As
   asserções negativas olham só o que roda, senão reprovariam a documentação. */
const codigo = playBilling
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const proguard = read('android/app/proguard-rules.pro');
const plugins = JSON.parse(read('android/app/src/main/assets/capacitor.plugins.json'));

describe('Sandbox do Play exige opt-in (achado 03)', () => {
  test('a falta de service account não libera mais nada', () => {
    // A regra antiga: token de teste + ausência de SA = 30 dias de Pro grátis.
    expect(codigo).not.toMatch(/const sandbox = token\.startsWith\("GPA\.test\."\) && !sa;/);
    expect(playBilling).toMatch(/const sandbox = sandboxLiberado\(\) && !sa && token\.startsWith\("GPA\.test\."\)/);
  });

  test('a liberação vem de uma variável própria, ligada de propósito', () => {
    expect(playBilling).toContain('PLAY_SANDBOX_ENABLED');
    const fn = playBilling.slice(
      playBilling.indexOf('function sandboxLiberado'),
      playBilling.indexOf('export async function verifyPurchase'),
    );
    expect(fn).toMatch(/=== "1" \|\| .* === "true"/);
  });

  test('sem service account e sem sandbox, a compra falha em vez de valer', () => {
    expect(playBilling).toMatch(/httpError\(503, "play-api-nao-configurada"\)/);
  });

  test('o tier real vem do Google, não do produto que o cliente informou', () => {
    const bloco = playBilling.slice(
      playBilling.indexOf('} else if (sa) {'),
      playBilling.indexOf('const existing = await findByPlayPurchaseToken'),
    );
    expect(bloco).toContain('getSubscriptionV2');
    expect(bloco).toMatch(/if \(!sub\.entitled\)/);
    expect(bloco).toContain('resolveTier(sub.productId)');
  });
});

describe('Nome do pacote fixado no servidor (achado 04)', () => {
  test('packageName não aceita mais argumento de fora', () => {
    expect(playBilling).toMatch(/function packageName\(\): string \{/);
    expect(codigo).not.toMatch(/packageName\(body\.packageName\)/);
  });

  test('lê da env, com o pacote do app como último recurso', () => {
    const fn = playBilling.slice(
      playBilling.indexOf('function packageName(): string'),
      playBilling.indexOf('function sandboxLiberado'),
    );
    expect(fn).toContain('PLAY_PACKAGE_NAME');
    expect(fn).toContain('com.financaspro.mobile');
  });

  test('todas as chamadas passaram a ser sem argumento', () => {
    const chamadas = codigo.match(/packageName\([^)]*\)/g) || [];
    const comArgumento = chamadas.filter((c) => c !== 'packageName()');
    expect(comArgumento).toEqual([]);
  });
});

describe('ProGuard guarda o pacote que existe de verdade (achado 05)', () => {
  const classpathBiometria = (plugins.find(
    (p) => p.pkg === '@capgo/capacitor-native-biometric',
  ) || {}).classpath;

  test('o plugin de biometria está no build', () => {
    expect(classpathBiometria).toBeTruthy();
  });

  test('a regra de keep cobre o pacote real do plugin', () => {
    const raiz = classpathBiometria.split('.').slice(0, 2).join('.');
    expect(raiz).toBe('ee.forgr');
    expect(proguard).toContain('-keep class ee.forgr.** { *; }');
  });

  test('a regra morta apontando para um pacote inexistente saiu', () => {
    expect(proguard).not.toContain('-keep class io.capgo.**');
  });
});
