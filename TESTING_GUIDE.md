# 🧪 FinançasPro v1.0 — Testing Guide

**Purpose:** Validate all security fixes before deployment  
**Time Required:** ~30-45 minutes  
**Requirements:** Modern browser (Chrome/Firefox), F12 DevTools, internet connection

---

## ⚡ Quick Start

1. **Start a local server:**
   ```bash
   # Option 1: Python 3
   python -m http.server 8000
   
   # Option 2: Node.js (npx)
   npx http-server
   
   # Option 3: Live Server (VSCode extension)
   # Just press Go Live button
   ```

2. **Open app:** `http://localhost:8000`

3. **Open DevTools:** F12 (or Cmd+Option+I on Mac)

4. **Follow test sequences below**

---

## 🔴 CRITICAL TESTS (Run First)

### TEST 1: Form Submission Works
**What:** Verify transaction creation functions end-to-end  
**Why:** Entire app depends on this working  
**Risk if Fails:** App is completely broken

**Steps:**
1. Navigate to "Novo" tab
2. Select "Despesa" (Expense)
3. Fill form:
   - O quê? = "Café"
   - Valor = "15.50"
   - Data = Today
   - Categoria = "Alimentação"
   - Observação = "Com amigos"
4. Click "✅ Registrar"
5. Watch for success toast
6. Go to "Extrato" tab
7. Look for transaction

**Expected Result:**
- ✅ Green success toast appears
- ✅ Transaction appears in Extrato list
- ✅ Correct values displayed: "Alimentação", "15.50", today's date

**If Fails:** Check browser console (F12) for JavaScript errors. Form IDs may not match HTML.

---

### TEST 2: Unique ID Generation (No Collisions)
**What:** Verify IDs are unique even with rapid creation  
**Why:** Duplicate IDs would break delete/update operations  
**Risk if Fails:** Data corruption on bulk import

**Steps:**
1. Open DevTools Console (F12 → Console)
2. Paste and run:
   ```javascript
   for(let i = 0; i < 100; i++) {
     TRANSACOES.criar('despesa', Math.random() * 100, 'alimentacao', '2026-04-25', `teste-${i}`);
   }
   ```
3. Go to DevTools → Storage → LocalStorage
4. Click key `fp-transacoes`
5. View the JSON (or use console):
   ```javascript
   const txs = DADOS.getTransacoes();
   const ids = txs.map(t => t.id);
   const unique = new Set(ids);
   console.log('Total:', ids.length, 'Unique:', unique.size);
   ```

**Expected Result:**
- ✅ Output: "Total: 100 Unique: 100"
- ✅ All IDs are unique strings like `1682051234567-a3c5d2e1f-1`
- ✅ No duplicate IDs

**If Fails:** IDs are colliding. This is a critical vulnerability affecting data integrity.

---

### TEST 3: XSS Prevention (onclick Injection)
**What:** Verify malicious code cannot execute via ID fields  
**Why:** Most common web vulnerability; attacker could steal data  
**Risk if Fails:** Complete security breach

**Steps:**
1. Open DevTools Console
2. Create transaction with malicious ID:
   ```javascript
   const maliciousTx = {
     id: "'); alert('XSS from ID'); //",
     tipo: 'despesa',
     valor: 100,
     categoria: 'outro',
     data: '2026-04-25',
     descricao: 'test'
   };
   DADOS.salvarTransacao(maliciousTx);
   RENDER.renderExtrato();
   ```
3. Go to Extrato tab
4. Open DevTools → Elements/Inspector
5. Look at HTML of transaction
6. Search for `onclick` attribute

**Expected Result:**
- ❌ NO alert box appears (XSS blocked)
- ❌ HTML does NOT contain `onclick` attribute
- ✅ HTML contains `data-tx-id` with escaped value
- ✅ Raw HTML shows: `&quot;); alert...` (escaped)

**If Fails:** Inline onclick handlers present - security vulnerability!

---

## 🟠 HIGH-PRIORITY TESTS

### TEST 4: CSS Loads Offline
**What:** Verify styling works without internet  
**Why:** PWA must function completely offline  
**Risk if Fails:** App unusable offline

**Steps:**
1. Load app normally at `http://localhost:8000`
2. Open DevTools → Network tab
3. Check "Offline" checkbox
4. Refresh page (F5)
5. Check if page has styling (colors, layout, not plain HTML)
6. Check Console for CSS errors

**Expected Result:**
- ✅ Page loads with CSS (colors visible, buttons styled)
- ✅ Layout is preserved
- ✅ No 404 errors for CSS in Console
- ✅ No "Failed to load resource" messages

**If Fails:** CSS not cached in Service Worker. Check sw.js urlsParaCache array includes `/css/style.css`.

---

### TEST 5: Corrupted JSON Doesn't Crash
**What:** Verify error handling for corrupted localStorage  
**Why:** localStorage can become corrupted; must not crash app  
**Risk if Fails:** Unrecoverable data loss

**Steps:**
1. Open DevTools Console
2. Corrupt localStorage:
   ```javascript
   localStorage.setItem('fp-transacoes', '{invalid json');
   ```
3. Refresh page (F5)
4. Check if app still loads (doesn't crash)
5. Check Console for error messages
6. Try creating a transaction
7. Check Console output

**Expected Result:**
- ✅ App loads without crashing
- ✅ Console shows warning: "⚠️ Dados corrompidos"
- ✅ Console shows error: "❌ Erro ao carregar transações"
- ✅ Transaction form works fine (uses empty data)
- ✅ Existing corrupted data is recovered to valid state

**If Fails:** Application crashes on JSON parse error. Add try-catch blocks.

---

### TEST 6: HTML in Descriptions is Escaped
**What:** Verify description field cannot execute scripts  
**Why:** Attacker could inject tags like `<img onerror>`  
**Risk if Fails:** XSS vulnerability in user input

**Steps:**
1. Create transaction with malicious description:
   ```javascript
   // Option A: Via form
   // - Go to "Novo" tab
   // - In "Observação" field, enter: <img src=x onerror="alert('XSS')">
   // - Submit form
   
   // Option B: Via console
   TRANSACOES.criar('despesa', 50, 'outro', '2026-04-25', '<img src=x onerror="alert(\'XSS\')">');
   RENDER.renderExtrato();
   ```
2. Go to Extrato tab
3. Open DevTools → Elements
4. Find the transaction in HTML
5. Look at the description field

**Expected Result:**
- ❌ NO alert box appears
- ✅ Description shows literally: `<img src=x onerror=...>`
- ✅ HTML is escaped: `&lt;img src=x...`
- ✅ Script tag not executed

**If Fails:** HTML not escaped. Add `UTILS.escapeHtml()` calls.

---

### TEST 7: Number Validation Works
**What:** Verify negative/zero/non-numeric values rejected  
**Why:** Invalid amounts break accounting logic  
**Risk if Fails:** Financial data corruption

**Steps:**
1. Go to "Novo" tab
2. Try each invalid value:

   **Test 7a: Negative number**
   - Valor = "-100"
   - Click Register
   - Expected: ❌ Error toast appears, transaction NOT created

   **Test 7b: Non-numeric**
   - Valor = "abc"
   - Click Register
   - Expected: ❌ Error toast appears, transaction NOT created

   **Test 7c: Zero**
   - Valor = "0"
   - Click Register
   - Expected: ❌ Error toast appears, transaction NOT created

   **Test 7d: Very large number**
   - Valor = "999999999"
   - Click Register
   - Expected: ✅ Accepted (no maximum limit)

   **Test 7e: Valid decimal**
   - Valor = "25.50"
   - Click Register
   - Expected: ✅ Transaction created successfully

**Expected Result:**
- ✅ All invalid values rejected with clear error message
- ✅ Valid values accepted
- ✅ No negative transactions in database
- ✅ Toast shows: "Valor deve ser um número maior que zero"

**If Fails:** Validation not working. Check setupFormSubmit() in init.js.

---

## 🟡 MEDIUM-PRIORITY TESTS

### TEST 8: Service Worker Path Works
**What:** Verify service worker registration works from any path  
**Why:** May deploy to subdirectories, not just root  
**Risk if Fails:** Offline functionality broken in subdirectories

**Steps:**
1. Open DevTools → Application tab
2. Look for "Service Workers" section
3. Verify one entry showing:
   - Status: "activated and running"
   - URL: `./sw.js` (relative path)
4. Go offline (Network tab → Offline)
5. Try navigating within app
6. Go back online
7. Refresh - should sync gracefully

**Expected Result:**
- ✅ Service Worker is "activated and running"
- ✅ Shows relative path `./sw.js` in registration
- ✅ App functions completely offline
- ✅ No 404 errors for sw.js

**If Fails:** Service worker not registered. Check init.js line 134.

---

### TEST 9: Performance with 1000 Transactions
**What:** Verify app doesn't lag with realistic data volume  
**Why:** Proves app scales to real-world usage  
**Risk if Fails:** Poor user experience with months of data

**Steps:**
1. Open DevTools Console
2. Create 1000 transactions:
   ```javascript
   console.time('Bulk Create');
   for(let i = 0; i < 1000; i++) {
     TRANSACOES.criar('despesa', Math.random() * 1000, 'alimentacao', '2026-04-25');
   }
   console.timeEnd('Bulk Create');
   ```
3. Time the renderExtrato call:
   ```javascript
   console.time('Render');
   RENDER.renderExtrato();
   console.timeEnd('Render');
   ```
4. Observe the Extrato tab loading
5. Scroll through the list
6. Try deleting a transaction

**Expected Result:**
- ✅ Bulk create takes < 5 seconds
- ✅ Render takes < 2 seconds
- ✅ List scrolls smoothly without lag
- ✅ Delete works instantly
- ✅ No browser "Not Responding" messages

**If Fails:** Performance issue. Check for:
- Nested loops in render functions
- Missing pagination/virtualization
- Memory leaks

---

## 🟢 REGRESSION TESTS

### TEST 10: All Main Features Work
**Checklist** - Go through each feature once:

- [ ] **Create Receita** (Revenue)
  - Go to Novo → Select "Receita"
  - Fill form, submit
  - Appears in Extrato

- [ ] **Create Despesa** (Expense)
  - Go to Novo → Select "Despesa"
  - Fill form, submit
  - Appears in Extrato

- [ ] **Delete Transaction**
  - Go to Extrato
  - Click × button on transaction
  - Transaction disappears

- [ ] **Filter Extrato**
  - Go to Extrato
  - Click "💚 Receitas"
  - Only revenues shown
  - Click "❤️ Despesas"
  - Only expenses shown
  - Click "📋 Todas"
  - All shown

- [ ] **Monthly Summary**
  - Go to "📊 Resumo"
  - Check cards show correct totals
  - Check "Ultimas transações" shows recent ones

- [ ] **Budget Management**
  - Go to "Orçamento"
  - Set limits for categories (100, 200, etc)
  - Click "Salvar Limites"
  - Try creating transactions
  - Check if "Gastos por Categoria" on Resumo updates

- [ ] **Export Data**
  - Go to "Config" (⚙️)
  - Click "📥 Exportar JSON"
  - JSON file downloads with today's date

- [ ] **Theme Toggle**
  - Go to "Config"
  - Select "Escuro"
  - Page turns dark
  - Select "Claro"
  - Page returns to light

**Result:** ✅ All features work as expected

---

## 📋 Test Summary Template

```
Test Date: __________
Tester: __________
Browser: __________ Version: __________
Platform: __________ (Windows/Mac/Linux)

CRITICAL TESTS:
[ ] Test 1: Form Works ................ PASS / FAIL
[ ] Test 2: Unique IDs ................ PASS / FAIL
[ ] Test 3: XSS Prevention ............ PASS / FAIL

HIGH-PRIORITY TESTS:
[ ] Test 4: CSS Offline ............... PASS / FAIL
[ ] Test 5: JSON Error Handling ....... PASS / FAIL
[ ] Test 6: Description Escaping ...... PASS / FAIL
[ ] Test 7: Number Validation ......... PASS / FAIL

MEDIUM-PRIORITY TESTS:
[ ] Test 8: Service Worker ............ PASS / FAIL
[ ] Test 9: Performance (1000 txs) .... PASS / FAIL

REGRESSION TESTS:
[ ] Test 10: All Features ............. PASS / FAIL

Browser Console Errors: _______________
LocalStorage Corruption: _______________
Overall Status: _______________

APPROVAL:
- [ ] All critical tests pass
- [ ] All high-priority tests pass
- [ ] Ready for staging deployment
- [ ] Ready for production deployment

Signed: __________ Date: __________
```

---

## 🚨 Troubleshooting

**Form not submitting?**
- Check browser console for errors
- Verify form ID is `form-transacao` in HTML
- Verify input IDs match: `novo-valor`, `novo-categoria`, etc.

**Transactions disappearing?**
- Check localStorage in DevTools
- Export data to backup if needed
- Clear storage and reload if corrupted

**Service Worker not registering?**
- Check DevTools → Application → Service Workers
- Reload page after clearing cache
- Check browser console for errors

**XSS attack still works?**
- Search HTML for `onclick` attributes
- Check all IDs/descriptions are escaped
- Verify `UTILS.escapeHtml()` is called

**Performance issues with many transactions?**
- Check browser performance in DevTools
- Profile the renderExtrato() function
- Consider pagination for 10000+ transactions

---

**Created:** 2026-04-25  
**Version:** 1.0  
**Last Updated:** 2026-04-25
