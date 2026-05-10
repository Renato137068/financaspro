# 🔧 Guia de Correções — FinançasPro v1.0

## Erro CRÍTICO #1: XSS em render.js

### Antes (❌ Vulnerável):
```javascript
// render.js linha 102
const html = transacoes.map(t => `
  <div class="transacao-item-full">
    ...
    <button class="btn-delete" onclick="TRANSACOES.deletar('${t.id}'); RENDER.renderExtrato(); ...">×</button>
  </div>
`).join('');
```

### Depois (✅ Seguro):

**1. Alterar o template em render.js:**
```javascript
renderExtrato() {
  const transacoes = TRANSACOES.obter({});
  const container = UTILS.$('#lista-transacoes');
  
  if (!container) return;
  
  if (transacoes.length === 0) {
    container.innerHTML = '<p class="empty">Nenhuma transação</p>';
    return;
  }
  
  const html = transacoes.map(t => `
    <div class="transacao-item-full" data-tx-id="${escapeHtml(t.id)}">
      <div class="transacao-info-full">
        <div class="transacao-categoria">${escapeHtml(t.categoria)}</div>
        <div class="transacao-descricao">${escapeHtml(t.descricao || '-')}</div>
        <div class="transacao-data">${UTILS.formatarData(t.data)}</div>
      </div>
      <div class="transacao-actions">
        <div class="transacao-valor ${t.tipo}">
          ${t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-'} ${UTILS.formatarMoeda(t.valor)}
        </div>
        <button class="btn-delete" type="button">×</button>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
  
  // ✅ Usar event delegation seguro
  container.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
      const item = deleteBtn.closest('[data-tx-id]');
      const id = item.dataset.txId;
      TRANSACOES.deletar(id);
      RENDER.renderExtrato();
      RENDER.atualizarHeaderSaldo();
    }
  });
}

// ✅ Adicionar função de escape a utils.js
UTILS.escapeHtml = function(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
};
```

**2. Adicionar ao CSS para aceitar o novo seletor:**
```css
.transacao-item-full[data-tx-id] {
  /* CSS existente continua igual */
}
```

---

## Erro CRÍTICO #2: Mismatch de IDs

### Problema:
HTML e JavaScript usam IDs diferentes

### Solução:

**Opção A: Alterar JavaScript para coincidir com HTML**

Em `js/init.js`, função `setupFormSubmit()`:

```javascript
// ❌ ERRADO (antes)
function setupFormSubmit() {
  const form = document.getElementById('form-nova-transacao');  // NÃO EXISTE!
  const valor = UTILS.$('#valor-transacao');  // NÃO EXISTE!
  const categoria = UTILS.$('#categoria-transacao');  // NÃO EXISTE!
  
  // ✅ CORRETO (depois)
  const form = document.getElementById('form-transacao');
  const tipoBtn = document.querySelectorAll('.tipo-btn');
  let tipoSelecionado = 'despesa';
  
  // Setup tipo selector
  tipoBtn.forEach(btn => {
    btn.addEventListener('click', () => {
      tipoBtn.forEach(b => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      tipoSelecionado = btn.dataset.tipo;
    });
  });
  
  if (!form) {
    console.error('Form não encontrado! Verifique os IDs em index.html');
    return;
  }
  
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    
    try {
      const tipo = tipoSelecionado;
      const valor = UTILS.$('#novo-valor')?.value;  // ✅ CORRETO
      const categoria = UTILS.$('#novo-categoria')?.value;  // ✅ CORRETO
      const data = UTILS.$('#novo-data')?.value;  // ✅ CORRETO
      const descricao = UTILS.$('#novo-nota')?.value;  // ✅ CORRETO
      
      // Validação
      if (!tipo || !valor || !categoria || !data) {
        UTILS.mostrarToast('Preencha todos os campos obrigatórios', 'error');
        return;
      }
      
      const valorNum = parseFloat(valor);
      if (isNaN(valorNum) || valorNum <= 0) {
        UTILS.mostrarToast('Valor deve ser um número maior que 0', 'error');
        return;
      }
      
      TRANSACOES.criar(tipo, valorNum, categoria, data, descricao);
      
      UTILS.mostrarToast('Transação registrada com sucesso!', 'success');
      
      // Limpar formulário
      form.reset();
      tipoBtn[0].classList.add('ativo');
      tipoSelecionado = 'despesa';
      
      // Atualizar UI
      RENDER.renderResumo();
      RENDER.renderExtrato();
      RENDER.renderOrcamento();
      RENDER.atualizarHeaderSaldo();
      
    } catch (erro) {
      UTILS.mostrarToast(erro.message, 'error');
    }
  });
}
```

**Também em render.js, função `setupFormCategories()`:**

```javascript
renderFormCategories() {
  // Não mais necessário procurar por #tipo-transacao
  // Os tipos são selecionados via botões no HTML
  this.atualizarCategorias('despesa');
},

atualizarCategorias(tipo) {
  const categorias = tipo === CONFIG.TIPO_RECEITA 
    ? CONFIG.CATEGORIAS_RECEITA 
    : CONFIG.CATEGORIAS_DESPESA;
  
  const select = UTILS.$('#novo-categoria');  // ✅ ID correto
  if (!select) return;
  
  select.innerHTML = '<option value="">Selecione a categoria</option>' +
    categorias.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}
```

---

## Erro CRÍTICO #3: Colisão de IDs

### Antes (❌ Vulnerável):
```javascript
// dados.js linha 32
transacao.id = transacao.id || Date.now().toString();

// Problema: Duas transações no mesmo ms = mesmo ID
```

### Depois (✅ Seguro):

**Adicionar função de UUID a utils.js:**

```javascript
// Adicionar a UTILS
gerarId: function() {
  // Use um método robusto de geração de ID único
  // Formato: timestamp-randomness-sequence
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substr(2, 9);
  const counter = (UTILS._idCounter = (UTILS._idCounter || 0) + 1);
  return `${timestamp}-${randomPart}-${counter}`;
},

_idCounter: 0
```

**Alterar dados.js:**

```javascript
salvarTransacao(transacao) {
  const transacoes = this.getTransacoes();
  transacao.id = transacao.id || UTILS.gerarId();  // ✅ Usar novo gerador
  transacao.dataCriacao = transacao.dataCriacao || new Date().toISOString();
  
  const index = transacoes.findIndex(t => t.id === transacao.id);
  if (index >= 0) {
    transacoes[index] = transacao;
  } else {
    transacoes.push(transacao);
  }
  
  localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify(transacoes));
  return transacao;
}
```

**Alterar transacoes.js:**

```javascript
criar(tipo, valor, categoria, data, descricao = '') {
  const validacao = UTILS.validarTransacao({
    tipo,
    valor: parseFloat(valor),
    categoria,
    data
  });
  
  if (!validacao.valido) {
    throw new Error(validacao.erro);
  }
  
  const transacao = {
    id: UTILS.gerarId(),  // ✅ Novo ID seguro
    tipo,
    valor: parseFloat(valor),
    categoria,
    data,
    descricao,
    dataCriacao: new Date().toISOString()
  };
  
  const salva = DADOS.salvarTransacao(transacao);
  this._cache = DADOS.getTransacoes();
  return salva;
}
```

---

## Erro ALTA #1: CSS Ausente do Cache

### Em sw.js:

```javascript
// ❌ ANTES
const urlsParaCache = [
  '/',
  '/index.html',
  '/js/config.js',
  // ... CSS FALTANDO!
];

// ✅ DEPOIS
const urlsParaCache = [
  '/',
  '/index.html',
  '/css/style.css',  // ← ADICIONAR
  '/js/config.js',
  '/js/dados.js',
  '/js/utils.js',
  '/js/transacoes.js',
  '/js/orcamento.js',
  '/js/render.js',
  '/js/config-user.js',
  '/js/init.js'
];
```

---

## Erro ALTA #2: JSON Parse Sem Error Handling

### Antes (❌ Pode quebrar):
```javascript
// dados.js
getTransacoes() {
  const data = localStorage.getItem(CONFIG.STORAGE_TRANSACOES);
  return data ? JSON.parse(data) : [];  // ❌ Pode lançar SyntaxError
}
```

### Depois (✅ Robusto):
```javascript
getTransacoes() {
  try {
    const data = localStorage.getItem(CONFIG.STORAGE_TRANSACOES);
    if (!data) return [];
    
    const parsed = JSON.parse(data);
    
    // Validar que é array
    if (!Array.isArray(parsed)) {
      console.warn('Dados corrompidos: esperado array');
      return [];
    }
    
    return parsed;
  } catch (e) {
    console.error('Erro ao carregar transações:', e);
    // Não deletar automaticamente - deixar usuário decidir
    return [];
  }
},

getConfig() {
  try {
    const data = localStorage.getItem(CONFIG.STORAGE_CONFIG);
    if (!data) return CONFIG.DEFAULT_CONFIG;
    
    const parsed = JSON.parse(data);
    
    // Mergear com defaults para segurança
    return { ...CONFIG.DEFAULT_CONFIG, ...parsed };
  } catch (e) {
    console.error('Erro ao carregar config:', e);
    return CONFIG.DEFAULT_CONFIG;
  }
}
```

---

## Erro ALTA #3: Sanitizar Renderizações

### Antes (❌ XSS Possível):
```javascript
// render.js
const html = transacoes.map(t => `
  <div class="transacao-categoria">${t.categoria}</div>
  <div class="transacao-descricao">${t.descricao || '-'}</div>
`).join('');
```

### Depois (✅ Seguro):
```javascript
const html = transacoes.map(t => `
  <div class="transacao-categoria">${UTILS.escapeHtml(t.categoria)}</div>
  <div class="transacao-descricao">${UTILS.escapeHtml(t.descricao || '-')}</div>
`).join('');
```

---

## Erro MÉDIA #1: Service Worker Path

### Antes (❌ Não funciona em subdiretórios):
```javascript
// index.html e init.js
navigator.serviceWorker.register('/sw.js')
```

### Depois (✅ Relativo):
```javascript
// init.js
if ('serviceWorker' in navigator) {
  // Obter o caminho base da aplicação
  const basePath = document.querySelector('script[src*="init.js"]')
    ?.src.split('js/')[0] || './';
  
  navigator.serviceWorker.register(basePath + 'sw.js')
    .catch(err => {
      console.log('Service Worker registration failed:', err);
    });
}
```

Ou mais simples, assumindo estrutura relativa:
```javascript
// init.js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .catch(err => {
      console.log('Service Worker registration failed:', err);
    });
}
```

---

## Resumo das Mudanças Prioritárias

```
1. ✅ Adicionar escapeHtml() a utils.js
2. ✅ Corrigir todos os IDs no init.js e render.js  
3. ✅ Implementar gerarId() em utils.js
4. ✅ Alterar Date.now() para UTILS.gerarId()
5. ✅ Adicionar try-catch em JSON.parse
6. ✅ Sanitizar todas as renderizações com escapeHtml
7. ✅ Adicionar CSS ao sw.js cache
8. ✅ Remover código redundante em transacoes.js
9. ✅ Corrigir service worker path
10. ✅ Melhorar validação de números
```

**Tempo estimado: 8-10 horas de desenvolvimento**

---

*Guia de correções para FinançasPro v1.0 — 2026-04-25*
