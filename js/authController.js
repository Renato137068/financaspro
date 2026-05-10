/**
 * authController.js - UI de autenticacao e sessao.
 * Mantem as funcoes publicas usadas pelo bootstrap.
 */
function setupAuthUI() {
  var overlay = document.getElementById('auth-overlay');
  if (!overlay) return false;
  if (overlay.dataset.authBound === '1') {
    return !(overlay.style.display === 'flex');
  }
  overlay.dataset.authBound = '1';

  var tabs = overlay.querySelectorAll('.auth-tab');
  var loginForm = document.getElementById('auth-login-form');
  var registerForm = document.getElementById('auth-register-form');
  var message = document.getElementById('auth-message');
  var warning = document.getElementById('auth-env-warning');

  function showTab(name) {
    tabs.forEach(function(tab) {
      tab.classList.toggle('ativo', tab.dataset.authTab === name);
    });
    if (loginForm) loginForm.style.display = name === 'login' ? '' : 'none';
    if (registerForm) registerForm.style.display = name === 'register' ? '' : 'none';
    if (message) {
      message.textContent = name === 'login'
        ? 'Entre para continuar seu controle financeiro.'
        : 'Crie sua conta para começar a organizar seus dados.';
    }
  }

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      showTab(tab.dataset.authTab || 'login');
    });
  });

  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = document.getElementById('auth-login-email').value.trim();
      var password = document.getElementById('auth-login-password').value;
      DADOS.loginApi(email, password).then(function() {
        overlay.style.display = 'none';
        if (typeof APP_BOOTSTRAP !== 'undefined') APP_BOOTSTRAP.ativarApp();
      }).catch(function(err) {
        console.error('Login falhou:', err);
        UTILS.mostrarToast(err.message || 'Falha no login', 'error');
      });
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var nome = document.getElementById('auth-register-name').value.trim();
      var email = document.getElementById('auth-register-email').value.trim();
      var password = document.getElementById('auth-register-password').value;
      DADOS.registrarApi(nome, email, password).then(function() {
        return DADOS.loginApi(email, password);
      }).then(function() {
        overlay.style.display = 'none';
        if (typeof APP_BOOTSTRAP !== 'undefined') APP_BOOTSTRAP.ativarApp();
      }).catch(function(err) {
        console.error('Cadastro falhou:', err);
        UTILS.mostrarToast(err.message || 'Falha no cadastro', 'error');
      });
    });
  }

  if (warning) {
    if (window.location.protocol === 'file:') {
      warning.style.display = 'block';
      warning.textContent = 'Abra este app em http://localhost:4000/ para login e cadastro funcionarem.';
    } else {
      warning.style.display = 'none';
      warning.textContent = '';
    }
  }

  var sessao = DADOS.getSessao();
  if (sessao && sessao.token) {
    overlay.style.display = 'none';
    showTab('login');
    atualizarBarraSessao();
    return true;
  }

  overlay.style.display = 'flex';
  showTab('login');
  atualizarBarraSessao();
  return false;
}

function atualizarBarraSessao() {
  var label = document.getElementById('user-session-label');
  var sessao = DADOS.getSessao();
  if (!label) return;
  if (sessao && sessao.user && sessao.user.name) {
    label.textContent = 'Logado como ' + sessao.user.name;
  } else {
    label.textContent = 'Sessao local';
  }
}

function setupLogoutButton() {
  var btn = document.getElementById('btn-logout');
  if (!btn || btn.dataset.logoutBound === '1') return;
  btn.dataset.logoutBound = '1';
  btn.addEventListener('click', function() {
    DADOS.encerrarSessao();
    var overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'flex';
    atualizarBarraSessao();
    UTILS.mostrarToast('Sessao encerrada', 'info');
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { setupAuthUI: setupAuthUI, atualizarBarraSessao: atualizarBarraSessao, setupLogoutButton: setupLogoutButton };
}
