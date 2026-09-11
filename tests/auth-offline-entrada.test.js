/**
 * auth-offline-entrada.test.js — sem rede, com sessão guardada, o app abre.
 *
 * O bug: no build cloud o overlay de login subia por cima do dashboard e as
 * únicas saídas exigiam servidor. Como o desbloqueio é revogado toda vez que o
 * app vai para segundo plano, bastava trocar de app e voltar sem sinal para
 * ficar trancado fora dos próprios lançamentos — que estão inteiros no
 * aparelho. A senha é justamente o fator que NÃO se confere offline.
 *
 * A correção: o ping passa a devolver resposta, e quando ele diz que o
 * servidor não responde a tela troca o campo de senha por uma saída offline.
 * PIN (tela própria, PBKDF2 local) e biometria (verifyIdentity do aparelho)
 * continuam valendo como fator — o que sai é a exigência de rede.
 *
 * Testes estáticos, no mesmo padrão de auth-ux-regressao.test.js: não provam
 * o runtime, mas travam a correção para não ser desfeita sem alguém ver.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const auth = read('js/authController.js');
const html = read('index.html');
const supa = read('js/core/supabase.js');

/** Recorta o corpo de uma função declarada no fonte, por chaves balanceadas. */
function corpoDaFuncao(src, assinatura) {
  const inicio = src.indexOf(assinatura);
  expect(inicio).toBeGreaterThan(-1);
  let i = src.indexOf('{', inicio);
  let nivel = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') nivel++;
    else if (src[j] === '}') {
      nivel--;
      if (nivel === 0) return src.slice(inicio, j + 1);
    }
  }
  throw new Error('função sem fechamento: ' + assinatura);
}

describe('Ping — responde em vez de só pintar aviso', () => {
  const ping = corpoDaFuncao(supa, 'ping: function');

  test('tem teto de tempo: rede que aceita e não responde não pendura a tela', () => {
    expect(ping).toContain('AbortController');
    expect(ping).toContain('abort()');
    expect(ping).toMatch(/timeoutMs \|\| \d+/);
  });

  test('limpa o timer nos dois desfechos', () => {
    expect(ping).toContain('clearTimeout');
  });

  const check = corpoDaFuncao(auth, 'function _checkCloudReachable(');

  test('_checkCloudReachable devolve booleano, não undefined', () => {
    expect(check).toMatch(/return\s+Promise\.resolve\(true\)/);
    expect(check).toMatch(/return\s+SUPA_AUTH\.ping\(\)/);
    // Os dois braços do ping precisam resolver para um valor.
    expect(check).toMatch(/ping\(\)\.then\([\s\S]*?return true;/);
    expect(check).toMatch(/\.catch\([\s\S]*?return false;/);
  });
});

describe('Desbloqueio — a saída offline aparece quando o servidor não responde', () => {
  const desbloqueio = corpoDaFuncao(auth, 'function _mostrarDesbloqueioSessao(');

  test('consulta o alcance do servidor e troca para a entrada offline', () => {
    expect(desbloqueio).toContain('_checkCloudReachable()');
    expect(desbloqueio).toContain('_mostrarEntradaOffline');
    expect(desbloqueio).toMatch(/if \(online\) return;/);
  });

  test('o caminho online aparece na hora — o ping não bloqueia a tela', () => {
    // showLoginStep vem antes do .then do ping.
    const posStep = desbloqueio.indexOf("showLoginStep('password')");
    const posPing = desbloqueio.indexOf('_checkCloudReachable()');
    expect(posStep).toBeGreaterThan(-1);
    expect(posPing).toBeGreaterThan(posStep);
  });

  test('não reabre a saída offline se a biometria já resolveu', () => {
    expect(desbloqueio).toContain('_authEstaDesbloqueado()');
  });

  test('voltando o sinal, o campo de senha e a UI normal retornam', () => {
    expect(desbloqueio).toContain('_alternarUiOffline(false)');
  });
});

describe('O boot não espera o validate() para decidir (regressão real)', () => {
  // Sem rede e com access_token vencido, o getSession() do supabase-js entra em
  // retry com backoff e a promessa fica pendente por dezenas de segundos. Quando
  // a decisão de offline dependia dela, o app inteiro travava na tela de login —
  // reproduzido em Chromium antes da correção.
  const boot = auth.slice(
    auth.indexOf('var bootAuth ='),
    auth.indexOf('_authRegistrarBloqueioAoRetomar(overlay);'),
  );

  test('o ping resolve a entrada offline em paralelo, não depois do validate', () => {
    expect(boot).toContain('_resolvidoOffline');
    const posAlcance = boot.indexOf('alcance.then(');
    const posValidate = boot.indexOf('SUPA_AUTH.validate()');
    expect(posAlcance).toBeGreaterThan(-1);
    expect(posAlcance).toBeLessThan(posValidate);
  });

  test('a entrada offline exige sessão gravada neste aparelho', () => {
    expect(boot).toContain('temSessaoPersistida');
  });

  test('o validate, ao resolver depois, não desfaz a entrada offline', () => {
    expect(boot).toMatch(/if \(_resolvidoOffline\) return;/);
  });

  test('quem já está desbloqueado continua passando pelo gate de MFA', () => {
    expect(boot).toContain('_authGateMfaThenSuccess(overlay)');
  });
});

describe('temSessaoPersistida — pergunta que não depende de rede', () => {
  const fn = supa.slice(
    supa.indexOf('temSessaoPersistida: function'),
    supa.indexOf('getAccessToken:'),
  );

  test('lê o storage direto, sem chamar o cliente do Supabase', () => {
    expect(fn).toContain('localStorage.getItem(STORAGE_KEY)');
    expect(fn).not.toContain('client.auth');
    expect(fn).not.toContain('fetch(');
  });

  test('a chave é a mesma constante usada na criação do cliente', () => {
    expect(supa).toMatch(/var STORAGE_KEY = 'fp-supabase-auth';/);
    expect(supa).toMatch(/storageKey: STORAGE_KEY/);
  });

  test('storage ilegível não derruba o boot', () => {
    expect(fn).toContain('catch');
    expect(fn).toMatch(/return false;/);
  });
});

describe('Entrada offline', () => {
  const painel = corpoDaFuncao(auth, 'function _mostrarEntradaOffline(');

  test('esconde o campo de senha — offline ele não tem como ser conferido', () => {
    expect(painel).toMatch(/loginForm\.hidden = true/);
    expect(painel).toMatch(/loginForm\.style\.display = 'none'/);
  });

  test('mostra a saída offline e tenta a biometria, que roda no aparelho', () => {
    expect(painel).toContain('_alternarUiOffline(true)');
    expect(painel).toContain('_tentarBiometriaAutomatica');
  });

  test('preenche o e-mail da sessão guardada, sem pedir rede', () => {
    expect(painel).toContain('getSessionSync');
  });

  const entrar = corpoDaFuncao(auth, 'function _entrarOffline(');

  test('entrar offline desbloqueia de verdade e avisa o usuário', () => {
    expect(entrar).toContain('_authOnSuccess');
    expect(entrar).toContain('offline: true');
    expect(entrar).toMatch(/mostrarToast\(/);
    expect(entrar).toMatch(/Sem conex[ãa]o/i);
  });

  test('o botão está ligado ao handler', () => {
    expect(auth).toMatch(/auth-offline-btn[\s\S]{0,400}addEventListener\('click'[\s\S]{0,80}_entrarOffline/);
  });
});

describe('Marcação da tela de entrar', () => {
  test('a saída offline existe e nasce escondida', () => {
    expect(html).toMatch(/id="auth-offline-btn"[^>]*hidden/);
    expect(html).toMatch(/id="auth-offline-hint"[^>]*hidden/);
  });

  test('o texto diz onde os dados estão, sem prometer sincronização agora', () => {
    const bloco = html.slice(
      html.indexOf('id="auth-offline-btn"'),
      html.indexOf('auth-resend-email-btn'),
    );
    expect(bloco).toContain('Continuar sem conexão');
    expect(bloco).toMatch(/neste aparelho/i);
  });
});

describe('`hidden` precisa vencer o display da classe', () => {
  const css = fs.readFileSync(path.join(root, 'css/features/auth.css'), 'utf8');

  /* Bug encontrado ao verificar a correção no Chromium: `.auth-biometric-btn`
     declara `display: inline-flex`, que tem especificidade maior que o
     `[hidden] { display: none }` do agente de usuário. O atributo virava
     decoração — "Entrar com biometria" aparecia no navegador, onde biometria
     não existe, e clicar só dava erro. A saída offline usa a mesma classe. */
  test('existe regra explícita para os dois controles', () => {
    const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(semComentarios).toMatch(/\.auth-biometric-btn\[hidden\][\s\S]{0,80}display:\s*none\s*!important/);
    expect(semComentarios).toMatch(/\.auth-biometric-hint\[hidden\]/);
  });

  test('a classe continua com display próprio quando visível', () => {
    expect(css).toMatch(/\.auth-biometric-btn \{[\s\S]*?display: inline-flex/);
  });
});
