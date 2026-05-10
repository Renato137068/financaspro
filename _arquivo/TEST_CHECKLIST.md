# ✅ Checklist de Testes — FinançasPro v1.0

## 🔴 Testes CRÍTICOS

### ✔️ Teste 1: Formulário de Transação Funciona
**Erro corrigido:** Mismatch de IDs  
**Passos:**
1. Abrir app em navegador
2. Ir para aba "Novo"
3. Preencher: Descrição="Café", Valor=15.50, Data=hoje, Categoria=Alimentação
4. Clicar "Registrar"
5. Verificar se aparece toast de sucesso
6. Ir para "Extrato" e verificar se transação aparece

**Esperado:** ✅ Transação aparece no extrato  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

---

### ✔️ Teste 2: IDs Únicos (Sem Colisão)
**Erro corrigido:** ID duplicado com Date.now()  
**Passos:**
1. Abrir console (F12)
2. Executar:
```javascript
for(let i = 0; i < 100; i++) {
  TRANSACOES.criar('despesa', 10, 'alimentacao', '2026-04-25', 'teste');
}
```
3. Abrir DevTools → Storage → localStorage
4. Verificar `fp-transacoes`
5. Contar quantas transações tem
6. Verificar se tem 100

**Esperado:** ✅ 100 transações com IDs diferentes  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

**Verificação adicional:**
```javascript
const txs = DADOS.getTransacoes();
const ids = txs.map(t => t.id);
const unique = new Set(ids);
console.log('Total:', ids.length, 'Únicos:', unique.size);
// Esperado: Total: 100 Únicos: 100
```

---

### ✔️ Teste 3: XSS Prevention (onclick)
**Erro corrigido:** XSS em onclick  
**Passos:**
1. Abrir console (F12)
2. Executar:
```javascript
// Tentar injetar XSS via ID
const maliciousTx = {
  id: "'); alert('XSS'); //",
  tipo: 'despesa',
  valor: 100,
  categoria: 'outro',
  data: '2026-04-25',
  descricao: 'teste'
};
DADOS.salvarTransacao(maliciousTx);
RENDER.renderExtrato();
```
3. Verificar o código HTML gerado (`inspect element`)
4. Procurar por `onclick` attribute
5. Se houver `onclick`, verificar se o ID está escapado

**Esperado:** ❌ NÃO deve haver onclick, deve haver `data-tx-id` com HTML escapado  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

**Verificação de segurança:**
```javascript
// No DevTools
document.body.innerHTML  // Procurar por onclick
// Não deve encontrar: onclick="TRANSACOES.deletar(''); alert..."
// Deve encontrar: data-tx-id="&quot;); alert..."
```

---

## 🟠 Testes ALTOS

### ✔️ Teste 4: CSS Offline (PWA Cache)
**Erro corrigido:** CSS ausente do Service Worker  
**Passos:**
1. Abrir app normalmente
2. DevTools → Network
3. Desligar internet (marcar "Offline")
4. F5 para recarregar
5. Verificar se página carrega COM estilo (não puro HTML)
6. Verificar console por erros de CSS

**Esperado:** ✅ App aparece com CSS (cores, layout)  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

---

### ✔️ Teste 5: JSON Corrompido (Error Handling)
**Erro corrigido:** JSON.parse sem try-catch  
**Passos:**
1. Abrir DevTools → Console
2. Executar:
```javascript
localStorage.setItem('fp-transacoes', '{invalid json');
```
3. F5 para recarregar a página
4. Verificar se app ainda funciona (não quebra)
5. Verificar console por erro tratado

**Esperado:** ✅ App funciona, mostra mensagem de erro no console  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

---

### ✔️ Teste 6: Sanitização de Entrada (XSS na Descrição)
**Erro corrigido:** Descrição não escapada  
**Passos:**
1. Abrir app
2. Novo lançamento
3. Preencher Descrição com: `<img src=x onerror="alert('XSS')">`
4. Registrar
5. Abrir DevTools → Elements
6. Procurar a transação no DOM
7. Verificar HTML

**Esperado:** ❌ Não deve executar alert  
                  ✅ HTML deve estar escapado: `&lt;img src=x...`  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

**Verificação:**
```javascript
// No console, depois de renderizar
const desc = document.querySelector('.transacao-descricao').textContent;
console.log(desc);
// Esperado: "<img src=x onerror="alert('XSS')">"
// NÃO: executar alert
```

---

### ✔️ Teste 7: Validação de Números
**Erro corrigido:** Validação fraca de valores  
**Passos:**
1. Novo lançamento
2. Tentar registrar com Valor = "-100"
3. Esperado: ❌ Rejeitar, mostrar erro
4. Tentar com Valor = "abc"
5. Esperado: ❌ Rejeitar, mostrar erro
6. Tentar com Valor = "0"
7. Esperado: ❌ Rejeitar, mostrar erro
8. Tentar com Valor = "1000000000" (muito grande)
9. Esperado: ❌ Rejeitar, mostrar erro
10. Tentar com Valor = "25.50" (válido)
11. Esperado: ✅ Aceitar, criar transação

**Esperado:** ✅ Todos os casos inválidos rejeitados  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

---

## 🟡 Testes MÉDIOS

### ✔️ Teste 8: Código Redundante Removido
**Erro corrigido:** Código duplicado em transacoes.js  
**Passos:**
1. Abrir `js/transacoes.js`
2. Procurar função `obter()`
3. Verificar linhas 57-61
4. Não deve ter dois `resultado.sort()` idênticos
5. Deve ter lógica correta para `data-asc` e `data-desc`

**Esperado:** ✅ Apenas um sort por branch  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

---

### ✔️ Teste 9: Service Worker Path Funciona
**Erro corrigido:** Path absoluto `/sw.js`  
**Passos:**
1. App deve funcionar em `http://localhost:8000`
2. App deve funcionar em `http://localhost:8000/app/`
3. App deve funcionar em subdiretórios
4. Verificar DevTools → Application → Service Workers
5. Service Worker deve estar ativo

**Esperado:** ✅ SW registrado e funcional  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

---

### ✔️ Teste 10: Escape HTML em Categorias
**Erro corrigido:** Categorias não escapadas  
**Passos:**
1. Adicionar categoria customizada (se suportado): `<script>alert('xss')</script>`
2. Renderizar em Extrato
3. Procurar no DevTools por `<script>`
4. Deve estar escapado como `&lt;script&gt;`

**Esperado:** ❌ Não deve executar script  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

---

## 🟢 Testes de REGRESSÃO

### ✔️ Teste 11: Funcionalidades Principais
**Passos:**
1. Criar transação de receita ✅
2. Criar transação de despesa ✅
3. Deletar transação ✅
4. Ver resumo mensal ✅
5. Ver extrato ✅
6. Definir orçamento ✅
7. Salvar configurações ✅
8. Exportar dados ✅
9. Mudar tema (light/dark) ✅
10. Calcular saldo correto ✅

**Status:** [ ] Tudo OK [ ] Alguma falha

---

### ✔️ Teste 12: Performance (Sem Lags)
**Passos:**
1. Criar 1000 transações via console:
```javascript
for(let i = 0; i < 1000; i++) {
  TRANSACOES.criar('despesa', Math.random() * 1000, 'alimentacao', '2026-04-25');
}
RENDER.renderExtrato();
```
2. Observar se renderização é rápida (< 2 segundos)
3. Scrollar no extrato
4. Verificar se não travau

**Esperado:** ✅ Performance aceitável  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

---

### ✔️ Teste 13: Offline → Online Sync
**Passos:**
1. App carregada (Online)
2. DevTools → Network → Offline
3. Criar uma transação offline
4. DevTools → Network → Online
5. Esperar 2 segundos
6. Verificar se dados persistem

**Esperado:** ✅ Transação salva mesmo offline  
**Status:** [ ] Passou [ ] Falhou [ ] Não testado

---

## 📋 Checklist Final de Deployment

- [ ] Todos os erros CRÍTICOS corrigidos e testados
- [ ] Todos os erros ALTOS corrigidos e testados  
- [ ] Funcionalidades principais funcionam
- [ ] XSS prevention ativo em todos os pontos
- [ ] JSON parsing tem error handling
- [ ] IDs são únicos
- [ ] Service Worker cache completo
- [ ] CSS funciona offline
- [ ] Performance aceitável (< 2s renderização)
- [ ] Formulário funciona (IDs corretos)
- [ ] Validações ativas

## 🚨 Bloqueadores Críticos

**Não fazer deploy até que:**
1. ✅ Formulário funcione (IDs corretos)
2. ✅ Nenhum XSS possível (test 3, 6)
3. ✅ IDs únicos (test 2)
4. ✅ CSS carregue offline (test 4)

---

## 🔍 Testes de Segurança (Pentest)

```bash
# 1. Tentar XSS via description
POST /save-transaction
{
  "description": "<img src=x onerror=\"alert('xss')\">",
  "valor": 100
}
# Esperado: Escapado no DOM

# 2. Tentar XSS via categoria  
POST /save-transaction
{
  "categoria": "');alert('xss');//",
  "valor": 100
}
# Esperado: Nenhum alert

# 3. ID injection
POST /save-transaction
{
  "id": "'); console.log('compromised'); //",
  "valor": 100
}
# Esperado: ID tratado como string literal, não executado
```

---

## 📊 Rastreamento de Testes

| # | Teste | Crítico | Status | Data | Notas |
|---|-------|---------|--------|------|-------|
| 1 | Formulário Funciona | 🔴 | [ ] | | |
| 2 | IDs Únicos | 🔴 | [ ] | | |
| 3 | XSS Prevention | 🔴 | [ ] | | |
| 4 | CSS Offline | 🟠 | [ ] | | |
| 5 | JSON Error Handling | 🟠 | [ ] | | |
| 6 | Sanitização XSS | 🟠 | [ ] | | |
| 7 | Validação Números | 🟠 | [ ] | | |
| 8 | Código Limpo | 🟡 | [ ] | | |
| 9 | SW Path | 🟡 | [ ] | | |
| 10 | Escape HTML | 🟡 | [ ] | | |
| 11 | Regressão | 🟢 | [ ] | | |
| 12 | Performance | 🟢 | [ ] | | |
| 13 | Offline Sync | 🟢 | [ ] | | |

---

*Checklist de testes para FinançasPro v1.0 — 2026-04-25*
*Use este checklist para validar todas as correções antes de deployment*
