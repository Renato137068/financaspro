/**
 * setup-guide.test.js — progresso de configuração inicial (facilidade p/ iniciantes).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
function load() {
  const ctx = vm.createContext({ Math, Array, Object, String });
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'setup-guide.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'setup-guide.js' });
  return ctx.SETUP_GUIDE;
}
const SG = load();

describe('SETUP_GUIDE.computeProgress', () => {
  test('usuário novo: 0% e próximo = perfil', () => {
    const p = SG.computeProgress({});
    expect(p.concluidos).toBe(0);
    expect(p.total).toBe(4);
    expect(p.percentual).toBe(0);
    expect(p.proximo.chave).toBe('perfil');
    expect(p.completo).toBe(false);
  });
  test('avança para o próximo passo não concluído', () => {
    const p = SG.computeProgress({ perfil: true, transacao: true });
    expect(p.concluidos).toBe(2);
    expect(p.percentual).toBe(50);
    expect(p.proximo.chave).toBe('orcamento');
  });
  test('tudo feito => completo, sem próximo', () => {
    const p = SG.computeProgress({ perfil: true, transacao: true, orcamento: true, meta: true });
    expect(p.completo).toBe(true);
    expect(p.percentual).toBe(100);
    expect(p.proximo).toBeNull();
  });
  test('respeita a ordem dos passos', () => {
    // só meta feita => próximo ainda é perfil (primeiro não concluído)
    expect(SG.computeProgress({ meta: true }).proximo.chave).toBe('perfil');
  });
});

describe('SETUP_GUIDE.mensagemProximoPasso', () => {
  test('retorna o próximo passo com contagem', () => {
    const m = SG.mensagemProximoPasso({ perfil: true });
    expect(m.chave).toBe('transacao');
    expect(m.concluidos).toBe(1);
    expect(m.total).toBe(4);
    expect(m.texto).toMatch(/transação/i);
  });
  test('null quando tudo concluído', () => {
    expect(SG.mensagemProximoPasso({ perfil: true, transacao: true, orcamento: true, meta: true })).toBeNull();
  });
});

describe('SETUP_GUIDE.buildCardHtml', () => {
  test('usuário novo: barra 0%, 0 de 4, próximo = perfil', () => {
    const h = SG.buildCardHtml({});
    expect(h).toContain('Comece aqui');
    expect(h).toContain('0 de 4');
    expect(h).toContain('width:0%');
    expect(h).toContain('Personalize seu perfil');
    expect(h).toContain('Crie uma meta de economia');
    // "Próximo" deve estar no primeiro passo (perfil)
    expect(h.indexOf('Próximo')).toBeGreaterThan(-1);
  });
  test('progresso parcial: 2 de 4 e barra 50%', () => {
    const h = SG.buildCardHtml({ perfil: true, transacao: true });
    expect(h).toContain('2 de 4');
    expect(h).toContain('width:50%');
    expect(h).toContain('setup-step proximo');
  });
  test('setup completo => string vazia', () => {
    expect(SG.buildCardHtml({ perfil: true, transacao: true, orcamento: true, meta: true })).toBe('');
  });
  test('marca passos feitos com classe feito', () => {
    const h = SG.buildCardHtml({ perfil: true });
    expect(h).toContain('setup-step feito');
  });
});

describe('SETUP_GUIDE.buildCardHtml — CTA acionável', () => {
  test('novo usuário: botão leva ao perfil (config)', () => {
    const h = SG.buildCardHtml({});
    expect(h).toContain('data-action="mudar-aba"');
    expect(h).toContain('data-aba="config"');
    expect(h).toContain('setup-cta');
  });
  test('próximo = orçamento leva à aba orcamento', () => {
    const h = SG.buildCardHtml({ perfil: true, transacao: true });
    expect(h).toContain('data-aba="orcamento"');
  });
  test('próximo = transação leva à aba novo', () => {
    const h = SG.buildCardHtml({ perfil: true });
    expect(h).toContain('data-aba="novo"');
  });
  test('setup completo: sem card, sem CTA', () => {
    expect(SG.buildCardHtml({ perfil: true, transacao: true, orcamento: true, meta: true })).toBe('');
  });
});
