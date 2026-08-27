/**
 * focus-trap.js — Focus trap utility for modal dialogs
 * Ensures keyboard focus stays within modal when open
 * Usage: new FocusTrap(modalElement).activate();
 */

class FocusTrap {
  constructor(element) {
    this.element = element;
    this.focusableElements = [];
    this.firstFocusable = null;
    this.lastFocusable = null;
    // Captura o gatilho antes de qualquer .focus() dentro do modal.
    this.previousActiveElement = document.activeElement;
    this.boundKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Get all focusable elements within the trap
   */
  getFocusableElements() {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ].join(', ');

    return Array.from(this.element.querySelectorAll(focusableSelectors));
  }

  /**
   * Activate the focus trap
   */
  activate(initialFocusEl) {
    this.focusableElements = this.getFocusableElements();

    if (this.focusableElements.length === 0) {
      return;
    }

    this.firstFocusable = this.focusableElements[0];
    this.lastFocusable = this.focusableElements[this.focusableElements.length - 1];

    var toFocus = initialFocusEl || this.firstFocusable;
    if (toFocus && typeof toFocus.focus === 'function') {
      toFocus.focus();
    }

    this.element.addEventListener('keydown', this.boundKeyDown);
  }

  /**
   * Deactivate the focus trap
   */
  deactivate() {
    // Remove event listener
    this.element.removeEventListener('keydown', this.boundKeyDown);

    // Return focus to previous element
    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
    }
  }

  /**
   * Handle keyboard navigation
   */
  handleKeyDown(event) {
    if (event.key !== 'Tab') {
      return;
    }

    if (event.shiftKey) {
      // Shift + Tab - move backwards
      if (document.activeElement === this.firstFocusable) {
        event.preventDefault();
        this.lastFocusable.focus();
      }
    } else {
      // Tab - move forwards
      if (document.activeElement === this.lastFocusable) {
        event.preventDefault();
        this.firstFocusable.focus();
      }
    }
  }

  /**
   * Refresh focusable elements (useful when modal content changes)
   */
  refresh() {
    this.focusableElements = this.getFocusableElements();
    
    if (this.focusableElements.length === 0) {
      return;
    }

    this.firstFocusable = this.focusableElements[0];
    this.lastFocusable = this.focusableElements[this.focusableElements.length - 1];
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FocusTrap;
}
