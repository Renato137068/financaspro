/**
 * backup-cifrado.js — senha opcional no arquivo de backup.
 *
 * Auditoria de segurança de 08/10/2026: o backup saía em JSON legível, com
 * lançamentos, contas, perfil (nome, telefone, endereço) e fotos de
 * comprovantes, e ia parar na pasta de arquivos baixados ou numa conversa de WhatsApp.
 * Quem achasse o arquivo lia tudo; a cifragem local não valia para ele.
 *
 * Com senha, o arquivo vira um envelope JSON com o conteúdo cifrado:
 * AES-GCM 256 com chave derivada da senha por PBKDF2-SHA256 (600 mil
 * iterações, o mesmo da cifragem local enc3), sal e IV aleatórios por arquivo.
 * A senha não fica guardada em lugar nenhum: esquecê-la é perder o backup, e
 * a tela diz isso antes de exportar.
 *
 * ES Module (ADR 0005): chega no chunk 'config', junto de config-backup.js.
 */

import { UTILS } from '../core/utils.js';

const FORMATO = 'backup-cifrado-financaspro';
const ITERACOES = 600000;
const SENHA_MINIMA = 6;

function _paraBase64(bytes) {
  // Em blocos: String.fromCharCode(...bytes) estoura a pilha com anexos grandes.
  var partes = [];
  for (var i = 0; i < bytes.length; i += 0x8000) {
    partes.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
  }
  return btoa(partes.join(''));
}

function _deBase64(texto) {
  var bin = atob(String(texto || ''));
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function _derivarChave(senha, sal, iteracoes) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(senha), { name: 'PBKDF2' }, false, ['deriveKey']
  ).then(function(base) {
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  });
}

const BACKUP_CIFRADO = {
  FORMATO: FORMATO,
  SENHA_MINIMA: SENHA_MINIMA,

  disponivel: function() {
    return typeof crypto !== 'undefined' && !!crypto.subtle && typeof TextEncoder !== 'undefined';
  },

  /** O objeto lido do arquivo é um backup com senha? */
  ehCifrado: function(obj) {
    return !!(obj && typeof obj === 'object' && obj.formato === FORMATO && obj.dados);
  },

  /**
   * @param {string} texto JSON do backup
   * @param {string} senha
   * @returns {Promise<string>} JSON do envelope, pronto para salvar
   */
  cifrar: function(texto, senha) {
    var sal = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return _derivarChave(senha, sal, ITERACOES).then(function(chave) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, chave, new TextEncoder().encode(texto));
    }).then(function(cifrado) {
      return JSON.stringify({
        formato: FORMATO,
        versao: 1,
        kdf: 'PBKDF2-SHA256',
        iteracoes: ITERACOES,
        sal: _paraBase64(sal),
        iv: _paraBase64(iv),
        dados: _paraBase64(new Uint8Array(cifrado)),
      });
    });
  },

  /**
   * @param {object} envelope objeto lido do arquivo (ehCifrado = true)
   * @param {string} senha
   * @returns {Promise<string>} JSON do backup; rejeita com Error('SENHA_INCORRETA')
   */
  decifrar: function(envelope, senha) {
    var iteracoes = Number(envelope.iteracoes) || ITERACOES;
    var sal, iv, dados;
    try {
      sal = _deBase64(envelope.sal);
      iv = _deBase64(envelope.iv);
      dados = _deBase64(envelope.dados);
    } catch (e) {
      return Promise.reject(new Error('ARQUIVO_INVALIDO'));
    }
    return _derivarChave(senha, sal, iteracoes).then(function(chave) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, chave, dados);
    }).then(function(buf) {
      return new TextDecoder().decode(buf);
    }, function() {
      // AES-GCM não distingue senha errada de arquivo adulterado: os dois
      // falham na autenticação. Para a pessoa, quase sempre é a senha.
      throw new Error('SENHA_INCORRETA');
    });
  },

  /**
   * Modal da exportação: senha + confirmação, ou "Exportar sem senha".
   * @param {function(string|null)} onEscolha senha escolhida, ou null para sem senha
   */
  pedirSenhaExportacao: function(onEscolha) {
    BACKUP_CIFRADO._abrirModal({
      titulo: 'Proteger o backup com senha?',
      texto: 'Sem senha, quem encontrar o arquivo consegue ler seus lançamentos e seus dados. '
        + 'A senha não fica guardada em lugar nenhum: se você esquecê-la, o backup não abre.',
      confirmar: true,
      botaoOk: 'Exportar com senha',
      botaoAlternativo: 'Exportar sem senha',
      onOk: onEscolha,
      onAlternativo: function() { onEscolha(null); },
    });
  },

  /**
   * Modal da importação de um backup com senha.
   * @param {function(string)} onSenha
   * @param {string} [erro] mensagem da tentativa anterior
   */
  pedirSenhaImportacao: function(onSenha, erro) {
    BACKUP_CIFRADO._abrirModal({
      titulo: 'Este backup tem senha',
      texto: erro || 'Digite a senha usada ao exportar.',
      erro: !!erro,
      confirmar: false,
      botaoOk: 'Abrir backup',
      onOk: onSenha,
    });
  },

  _abrirModal: function(o) {
    var old = document.querySelector('.modal-overlay');
    if (old) old.remove();

    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'senha-bkp-title');
    ov.innerHTML = '<form class="modal-box" id="form-senha-bkp" novalidate>' +
      '<h3 id="senha-bkp-title">' + UTILS.escapeHtml(o.titulo) + '</h3>' +
      '<p id="senha-bkp-msg"' + (o.erro ? ' role="alert"' : '') + '>' + UTILS.escapeHtml(o.texto) + '</p>' +
      '<label for="input-senha-bkp">Senha do backup</label>' +
      '<input type="password" id="input-senha-bkp" class="form-input" autocomplete="new-password">' +
      (o.confirmar
        ? '<label for="input-senha-bkp2">Repita a senha</label>' +
          '<input type="password" id="input-senha-bkp2" class="form-input" autocomplete="new-password">'
        : '') +
      '<div class="modal-actions">' +
      (o.botaoAlternativo
        ? '<button class="btn-cancelar" type="button" id="bs-alternativo">' + UTILS.escapeHtml(o.botaoAlternativo) + '</button>'
        : '<button class="btn-cancelar" type="button" id="bs-cancelar">Cancelar</button>') +
      '<button class="btn-confirmar-primary" type="submit" id="bs-ok">' + UTILS.escapeHtml(o.botaoOk) + '</button>' +
      '</div></form>';
    document.body.appendChild(ov);

    var form = ov.querySelector('#form-senha-bkp');
    var input = ov.querySelector('#input-senha-bkp');
    var input2 = ov.querySelector('#input-senha-bkp2');
    var msg = ov.querySelector('#senha-bkp-msg');
    var focusTrap = null;
    if (typeof FocusTrap !== 'undefined' && FocusTrap) {
      focusTrap = new FocusTrap(ov);
      focusTrap.activate(input);
    } else {
      input.focus();
    }

    function fechar() {
      if (focusTrap) focusTrap.deactivate();
      document.removeEventListener('keydown', aoTeclar);
      ov.remove();
    }
    function aoTeclar(e) { if (e.key === 'Escape') fechar(); }
    function avisar(texto) {
      msg.textContent = texto;
      msg.setAttribute('role', 'alert');
    }

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var senha = input.value;
      if (!senha) { input.focus(); return; }
      if (o.confirmar) {
        if (senha.length < SENHA_MINIMA) {
          avisar('Use pelo menos ' + SENHA_MINIMA + ' caracteres.');
          input.focus();
          return;
        }
        if (senha !== input2.value) {
          avisar('As duas senhas não são iguais.');
          input2.focus();
          return;
        }
      }
      fechar();
      o.onOk(senha);
    });
    var alt = ov.querySelector('#bs-alternativo');
    if (alt) alt.addEventListener('click', function() { fechar(); o.onAlternativo(); });
    var cancelar = ov.querySelector('#bs-cancelar');
    if (cancelar) cancelar.addEventListener('click', fechar);
    ov.addEventListener('click', function(e) { if (e.target === ov) fechar(); });
    document.addEventListener('keydown', aoTeclar);
  },
};

export { BACKUP_CIFRADO };
export default BACKUP_CIFRADO;
