/**
 * ocr.js — removido do produto (07/09/2026).
 * O botão de câmera/OCR confundia o público de teste e não entregava valor
 * estável. Mantemos um stub vazio para não quebrar referências residuais
 * (lifecycle, chunks, testes estáticos). Anexos manuais de comprovante
 * (foto/PDF no formulário) continuam disponíveis.
 */
var OCR = {
  init: function() { /* no-op: OCR desativado */ },
  abrirScanner: function() { /* no-op */ },
  processarImagem: function() { /* no-op */ }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OCR;
}
