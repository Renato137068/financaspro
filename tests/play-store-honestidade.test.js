/**
 * play-store-honestidade.test.js — vitrine alinhada ao binário cloud.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('Honestidade Play Store / privacidade', () => {
  test('meta e manifest não prometem “sem cadastro”', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    expect(html).not.toMatch(/sem cadastro/i);
    expect(manifest.description).not.toMatch(/sem cadastro/i);
    expect(manifest.description).toMatch(/nuvem/i);
  });

  test('privacidade documenta Supabase, PIN e TOTP opcional', () => {
    const priv = fs.readFileSync(path.join(root, 'privacidade.html'), 'utf8');
    expect(priv).toContain('Supabase');
    expect(priv).toMatch(/PIN local/);
    expect(priv).toMatch(/N[ãa]o<\/em>\s*criptografa|n[ãa]o criptografa/i);
    expect(priv).toMatch(/duas etapas/i);
    expect(priv).toMatch(/app autenticador/i);
    expect(priv).toMatch(/2 de setembro de 2026|9 de setembro de 2026/);
    expect(priv).toMatch(/tokens de (acesso e )?renova|armazenamento local do WebView/i);
  });

  test('Data Safety do beta Play é cenário CLOUD (não “não coleta”)', () => {
    const ds = fs.readFileSync(path.join(root, 'docs/play-store-data-safety.md'), 'utf8');
    expect(ds).toMatch(/### A\.1 Cenário CLOUD/i);
    expect(ds).toMatch(/Play Billing/i);
    const start = ds.indexOf('### A.1');
    const end = ds.indexOf('### A.2');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const cloudBlock = ds.slice(start, end);
    expect(cloudBlock).toMatch(/→ \*\*SIM\*\*/);
    expect(cloudBlock).not.toMatch(/não envia dados para servidores/i);
  });

  test('assetlinks tem fingerprint SHA-256 do release', () => {
    const links = JSON.parse(
      fs.readFileSync(path.join(root, '.well-known/assetlinks.json'), 'utf8'),
    );
    const fps = links[0].target.sha256_cert_fingerprints;
    expect(fps.length).toBeGreaterThan(0);
    expect(fps[0]).toMatch(/^[0-9A-F:]{95}$/);
  });

  test('anexos suportam cifragem IndexedDB', () => {
    const anexos = fs.readFileSync(path.join(root, 'js/anexos.js'), 'utf8');
    expect(anexos).toContain('migrarCriptografia');
    expect(anexos).toContain('encryptedPayload');
    expect(anexos).toContain('_wrapBlobForStore');
    const dados = fs.readFileSync(path.join(root, 'js/core/dados.js'), 'utf8');
    expect(dados).toContain('ANEXOS.migrarCriptografia');
  });

  test('ficha Play não promete sem cadastro e bate com os SKUs', () => {
    const ficha = fs.readFileSync(path.join(root, 'docs/play-store-ficha.md'), 'utf8');
    expect(ficha).not.toMatch(/Não pede cadastro nem e-mail para começar/i);
    expect(ficha).toMatch(/trial de 7 dias/i);
    // A ficha publicada e os SKUs precisam contar a mesma história: preço
    // errado na loja é a reclamação que vira nota 1 estrela.
    expect(ficha).toMatch(/R\$ 16,99/);
    expect(ficha).toMatch(/R\$ 129,99\/ano/);
    expect(ficha).not.toMatch(/R\$ 12,90|R\$ 79,90\/ano/);
    expect(ficha).toMatch(/nuvem/i);
    // OCR foi removido do produto (07/09) — não vender na loja.
    expect(ficha).not.toMatch(/\bOCR\b/i);
  });

  test('a ficha não promete no gratuito o que o app não entrega', () => {
    const ficha = fs.readFileSync(path.join(root, 'docs/play-store-ficha.md'), 'utf8');
    const limites = JSON.parse(
      fs.readFileSync(path.join(root, 'config/plan-limits.json'), 'utf8'),
    );
    // "Lançamentos ilimitados" só pode estar na loja enquanto for verdade.
    if (/Lançamentos ilimitados/i.test(ficha)) {
      expect(limites.FREE.maxTransPerMonth).toBeNull();
    }
    if (/Até 5 contas e cartões/i.test(ficha)) {
      expect(limites.FREE.maxAccounts).toBe(5);
    }
    if (/últimos 3 meses/i.test(ficha)) {
      expect(limites.FREE.historyMonths).toBe(3);
    }
  });

  test('paywall sem login é honesto sobre o que o modo local é', () => {
    const init = fs.readFileSync(path.join(root, 'js/modules/init-billing.js'), 'utf8');
    expect(init).not.toMatch(/todos os recursos locais/i);
    // Sem conta o app entrega o plano gratuito inteiro — nem mais (como era,
    // quando offline liberava tudo), nem menos. E diz onde os dados ficam.
    expect(init).toMatch(/tudo do plano gratuito/i);
    expect(init).toMatch(/só neste aparelho/i);
    // Nada de prometer ilimitado a quem não assinou.
    expect(init).not.toMatch(/sem limite/i);
  });
});
