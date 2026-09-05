/**
 * edge-play-rtdn.test.js — guardas do webhook de billing do Google Play.
 *
 * A função roda em Deno, fora do alcance do jest, então aqui são guardas
 * estáticos. O que eles travam vale o incômodo: este endpoint mexe em estado
 * de assinatura, e regressão aqui custa dinheiro sem dar erro visível.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'supabase/functions/play-rtdn/index.ts'), 'utf8',
);

describe('play-rtdn — não aceita chamada não autenticada', () => {
  test('sem mecanismo configurado, recusa em vez de liberar geral', () => {
    // Antes: `if (secret) {...}` — com a env vazia, qualquer POST passava.
    expect(src).toContain('nao-configurado');
    expect(src).toMatch(/status:\s*503/);
    expect(src).toMatch(/!secret && !saEsperada/);
  });

  test('a decisão é uma variável única, não vários caminhos de saída', () => {
    expect(src).toMatch(/let autorizado = false/);
    expect(src).toMatch(/if \(!autorizado\)[\s\S]{0,120}status:\s*403/);
  });
});

describe('play-rtdn — comparação do segredo', () => {
  test('não compara com !== (vaza tamanho e primeira diferença)', () => {
    expect(src).not.toMatch(/provided\s*!==\s*secret/);
  });

  test('compara digests de tamanho fixo, acumulando XOR', () => {
    expect(src).toMatch(/crypto\.subtle\.digest\("SHA-256"/);
    expect(src).toMatch(/diff \|= x\[i\] \^ y\[i\]/);
  });
});

describe('play-rtdn — o segredo sai da URL', () => {
  test('o header tem precedência sobre a query string', () => {
    const i = src.indexOf('x-rtdn-secret');
    const j = src.indexOf('searchParams.get("secret")');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
  });

  test('a query string continua aceita, mas avisa que é deprecada', () => {
    // Pub/Sub push não envia header customizado: remover hoje quebraria a
    // integração existente. O aviso é o que puxa a migração.
    expect(src).toMatch(/deprecado/i);
    expect(src).toContain('console.warn');
  });

  test('OIDC é o caminho preferido e valida emissor, verificação e audiência', () => {
    expect(src).toContain('PLAY_RTDN_SERVICE_ACCOUNT');
    expect(src).toMatch(/info\.email !== saEsperada/);
    expect(src).toMatch(/email_verified/);
    expect(src).toMatch(/info\.aud !== audiencia/);
  });

  test('OIDC é avaliado antes do segredo', () => {
    const oidc = src.indexOf('autorizado = await oidcConfere');
    const seg = src.indexOf('autorizado = await segredoConfere');
    expect(oidc).toBeLessThan(seg);
  });
});
