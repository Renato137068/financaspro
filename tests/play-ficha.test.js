/**
 * play-ficha.test.js — o envio da ficha da loja (scripts/play-ficha.cjs).
 *
 * O workflow só roda à mão, com a chave da Play: um erro nele aparece na hora
 * de publicar. O que dá para conferir sem rede fica aqui: a ficha lida do
 * markdown é a que está escrita, cabe nos limites da Play, as imagens têm a
 * medida certa e o workflow só publica quando alguém pede.
 */
const fs = require('fs');
const path = require('path');
const { textos, imagens, conferir } = require('../scripts/play-ficha.cjs');

const ROOT = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** PNG mínimo: assinatura + IHDR com largura, altura e tipo de cor. */
function png(w, h, tipoCor = 2) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  b[24] = 8;
  b[25] = tipoCor;
  return b;
}

describe('ficha lida de docs/play-store-ficha.md', () => {
  const t = textos(ler('docs/play-store-ficha.md'));

  test('título, descrição curta e completa são os da ficha', () => {
    expect(t.title).toBe('FinançasPro Controle de Gastos');
    expect(t.shortDescription).toMatch(/^Controle de gastos/);
    expect(t.fullDescription).toMatch(/^O FinançasPro é um app/);
    expect(t.fullDescription).toMatch(/Lemos todas as mensagens\.$/);
    expect(t.fullDescription).not.toContain('```');
  });

  test('a ficha atual passa na conferência', () => {
    expect(conferir(t, imagens())).toEqual([]);
  });

  test('envia as capturas de celular 01 a 08, em ordem, e nenhuma de tablet', () => {
    const { phoneScreenshots, featureGraphic } = imagens();
    expect(phoneScreenshots.map((f) => path.basename(f).slice(0, 2))).toEqual(['01', '02', '03', '04', '05', '06', '07', '08']);
    expect(phoneScreenshots.join()).not.toMatch(/tablet|placeholder/);
    expect(featureGraphic.map((f) => path.basename(f))).toEqual(['destaque-1024x500.png']);
  });
});

describe('conferir', () => {
  const ok = { title: 'App', shortDescription: 'Curta', fullDescription: 'Completa' };
  const imgs = { phoneScreenshots: ['a', 'b'], featureGraphic: ['d'] };
  const arquivos = { a: png(1080, 1920), b: png(1920, 1080), d: png(1024, 500) };
  const lerFalso = (over = {}) => (rel) => ({ ...arquivos, ...over })[rel];

  test('aceita 9:16 e 16:9 com destaque 1024x500', () => {
    expect(conferir(ok, imgs, lerFalso())).toEqual([]);
  });

  test('recusa texto acima do limite da Play', () => {
    const erros = conferir({ ...ok, title: 'x'.repeat(31), shortDescription: '' }, imgs, lerFalso());
    expect(erros.join('\n')).toMatch(/title com 31/);
    expect(erros.join('\n')).toMatch(/shortDescription vazio/);
  });

  test('recusa 16:10 (as capturas de tablet de antes), canal alfa e destaque fora da medida', () => {
    const erros = conferir(ok, imgs, lerFalso({ a: png(1200, 1920), b: png(1080, 1920, 6), d: png(1024, 512) })).join('\n');
    expect(erros).toMatch(/a é 1200x1920, fora de 9:16/);
    expect(erros).toMatch(/b tem canal alfa/);
    expect(erros).toMatch(/d é 1024x512/);
  });

  test('recusa menos de 2 capturas', () => {
    expect(conferir(ok, { ...imgs, phoneScreenshots: ['a'] }, lerFalso())).toEqual(['1 capturas de celular (a Play aceita de 2 a 8)']);
  });
});

describe('workflow .github/workflows/play-ficha.yml', () => {
  const wf = ler('.github/workflows/play-ficha.yml');

  test('só roda à mão', () => {
    expect(wf).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(wf).not.toMatch(/^ {2}(push|pull_request|schedule):/m);
  });

  test('por padrão só valida; publica apenas com a opção marcada', () => {
    expect(wf).toMatch(/publicar:[\s\S]*?type: boolean\n\s+default: false/);
    expect(wf).toContain("inputs.publicar && '--publicar' || '--validar'");
  });

  test('usa o segredo do ambiente production, o mesmo do release', () => {
    expect(wf).toContain('environment: production');
    expect(wf).toContain('secrets.PLAY_SERVICE_ACCOUNT_JSON');
    expect(ler('.github/workflows/release.yml')).toContain('secrets.PLAY_SERVICE_ACCOUNT_JSON');
  });
});
