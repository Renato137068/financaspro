/**
 * share-texto.js — compartilha um texto via Web Share, com fallback para a área
 * de transferência. Centraliza o padrão usado por "meu mês", "plano de metas" e
 * "retrospectiva do ano". Opt-in: só roda quando o usuário aciona.
 *
 * compartilharTextoUI(texto, { vazio, copiado })
 *   - texto vazio/null → toast opts.vazio (se houver) e retorna.
 *   - navigator.share → compartilha (cancelar rejeita a promise; é engolido).
 *   - sem share → clipboard.writeText + toast opts.copiado.
 *   - sem nenhum → toast de indisponível.
 */
function compartilharTextoUI(texto, opts) {
  opts = opts || {};
  var toast = (typeof UTILS !== 'undefined' && UTILS.mostrarToast) ? UTILS.mostrarToast : function() {};

  if (!texto) {
    if (opts.vazio) toast(opts.vazio, 'info');
    return;
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ text: texto }).catch(function() {});
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(
        function() { toast(opts.copiado || 'Copiado', 'success'); },
        function() { toast('Não foi possível copiar', 'error'); }
      );
      return;
    }
  } catch (e) { /* ambiente sem share/clipboard */ }
  toast('Compartilhamento indisponível neste dispositivo', 'info');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = compartilharTextoUI;
}
