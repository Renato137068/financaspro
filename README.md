# 💰 FinançasPro MVP

> Gestor financeiro minimalista: transações, extrato, orçamento por categoria e configurações.

## 🎯 5 Funcionalidades Core

1. **📊 Resumo** - Dashboard com receitas, despesas e saldo mensal
2. **➕ Novo** - Adicionar transações de receita/despesa com categoria
3. **📋 Extrato** - Lista de transações com filtros e opção de deletar
4. **💰 Orçamento** - Definir limites por categoria com alertas
5. **⚙️  Config** - Perfil do usuário, seleção de moeda, exportar dados

## 📁 Estrutura

```
financaspro/
├── index.html              ← Interface (5 abas)
├── manifest.json           ← PWA config
├── sw.js                   ← Service Worker (offline)
├── package.json            ← Dependências
│
├── css/
│   └── style.css           ← Estilos (mobile-first)
│
├── js/                     ← módulos funcionais
│   ├── config.js           ← Constantes
│   ├── dados.js            ← localStorage
│   ├── utils.js            ← Utilidades
│   ├── transacoes.js       ← CRUD
│   ├── orcamento.js        ← Budget logic
│   ├── render.js           ← Renderização UI
│   ├── config-user.js      ← Configurações
│   ├── app-bootstrap.js    ← Orquestra inicialização
│   └── init.js             ← Startup
│
├── icons/                  ← PWA assets
│
└── .github/workflows/
    └── deploy.yml          ← CI/CD automático
```

## 🚀 Como Usar

### Online
Abra em seu navegador (GitHub Pages):
```
https://seu-usuario.github.io/financaspro
```

### Local (Desenvolvimento)
```bash
# Python 3
python -m http.server 8000

# Node
npx http-server

# Depois: http://localhost:8000
```

## ⚡ Características

- ✅ **Offline-first**: Funciona sem internet (PWA)
- ✅ **Vanilla JS**: Sem dependências externas
- ✅ **localStorage**: Dados salvos localmente
- ✅ **Responsivo**: Otimizado para mobile
- ✅ **Leve**: ~50KB total
- ✅ **Modular**: separação por domínio + bootstrap dedicado

## 🛠️ Desenvolvimento

### Adicionar nova transação
```javascript
TRANSACOES.criar(
  CONFIG.TIPO_DESPESA,
  100.50,
  'Alimentação',
  '2026-04-25',
  'Mercado'
);
```

### Definir limite orçamentário
```javascript
ORCAMENTO.definirLimite('Alimentação', 500);
```

### Exportar dados
Via interface: Config → Exportar Dados (download JSON)

### Backend inicial
Para iniciar a nova base de backend local:
```bash
npm run backend
```
Isso sobe uma API inicial em `http://localhost:4000` com persistência em arquivo na pasta `.data/`.

## 📊 Stack Técnico

- **Linguagem**: JavaScript ES6+
- **Persistência**: localStorage (2 chaves: transacoes, config)
- **Estilos**: CSS3 com variáveis (dark mode suportado)
- **PWA**: Service Worker para offline
- **Deploy**: GitHub Actions (automático)

## 🔒 Segurança

- ✅ Dados salvos localmente (não enviados para servidor)
- ✅ Sem autenticação (uso pessoal)
- ✅ HTTPS via GitHub Pages
- ✅ HTML escaping automático

## 📈 Performance

- **Tamanho**: ~50KB (antes: ~150KB)
- **Carregamento**: <1s (GitHub Pages)
- **Renderização**: <100ms

---

**Autor:** Renato José Soares  
**Email:** renato.soares1370@gmail.com  
**Versão:** MVP 1.0  
**Última atualização:** 2026-04-25
