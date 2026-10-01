/**
 * tablist-keyboard.js — WAI-ARIA Tabs: setas, Home/End, roving tabindex
 * Usage: TablistKeyboard.init(tablistElement, { onSelect: fn })
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

const TablistKeyboard = {
  _bound: null,

  _isBound: function(tablist) {
    if (!TablistKeyboard._bound) TablistKeyboard._bound = new WeakSet();
    return TablistKeyboard._bound.has(tablist);
  },

  _markBound: function(tablist) {
    if (!TablistKeyboard._bound) TablistKeyboard._bound = new WeakSet();
    TablistKeyboard._bound.add(tablist);
  },

  init: function(tablist, options) {
    if (!tablist || tablist.getAttribute('role') !== 'tablist') return null;
    if (TablistKeyboard._isBound(tablist)) return null;

    options = options || {};
    var tabSelector = options.tabSelector || '[role="tab"]';
    var onSelect = options.onSelect || null;

    function getTabs() {
      return Array.prototype.slice.call(tablist.querySelectorAll(tabSelector));
    }

    function enabledTabs() {
      return getTabs().filter(function(t) {
        return !t.disabled && t.getAttribute('aria-disabled') !== 'true';
      });
    }

    function updateRoving(active) {
      var tabs = getTabs();
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].setAttribute('tabindex', tabs[i] === active ? '0' : '-1');
      }
    }

    function syncFromDom() {
      var tabs = getTabs();
      var active = null;
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].getAttribute('aria-selected') === 'true') {
          active = tabs[i];
          break;
        }
      }
      if (!active && tabs.length) active = tabs[0];
      if (active) updateRoving(active);
    }

    function activateTab(tab, moveFocus) {
      if (!tab) return;
      if (onSelect) {
        onSelect(tab, { focus: !!moveFocus });
      } else {
        tab.click();
      }
      updateRoving(tab);
      if (moveFocus) tab.focus();
    }

    tablist.addEventListener('keydown', function(e) {
      var key = e.key;
      if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') return;

      var tabs = enabledTabs();
      if (!tabs.length) return;

      var current = document.activeElement;
      var idx = tabs.indexOf(current);
      if (idx === -1) return;

      e.preventDefault();
      var next = null;
      if (key === 'ArrowRight') {
        next = tabs[(idx + 1) % tabs.length];
      } else if (key === 'ArrowLeft') {
        next = tabs[(idx + tabs.length - 1) % tabs.length];
      } else if (key === 'Home') {
        next = tabs[0];
      } else if (key === 'End') {
        next = tabs[tabs.length - 1];
      }
      if (next) activateTab(next, true);
    });

    tablist.addEventListener('click', function(e) {
      var tab = e.target.closest(tabSelector);
      if (!tab || !tablist.contains(tab)) return;
      updateRoving(tab);
    });

    syncFromDom();
    TablistKeyboard._markBound(tablist);

    return { sync: syncFromDom };
  },

  initAll: function(selector, options) {
    var lists = document.querySelectorAll(selector || '[role="tablist"]');
    var handles = [];
    for (var i = 0; i < lists.length; i++) {
      var h = TablistKeyboard.init(lists[i], options);
      if (h) handles.push(h);
    }
    return handles;
  }
};

export { TablistKeyboard };
export default TablistKeyboard;
