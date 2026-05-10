/**
 * backend/lib/database.js - Abstração de banco de dados
 * Facilita migração futura para PostgreSQL
 */

const fs = require('fs/promises');
const path = require('path');
const CONFIG = require('../config');

// Schema padrão do store
const DEFAULT_STORE = {
  meta: { version: 1, createdAt: new Date().toISOString() },
  users: [],
  sessions: [],
  transactions: [],
  accounts: [],
  budgets: [],
  recurringTransactions: [],
  configByUserId: {}
};

class Database {
  constructor() {
    this.type = CONFIG.database.type;
    this.dataPath = path.join(CONFIG.database.json.dataDir, CONFIG.database.json.fileName);
    this.cache = null;
    this.lastRead = 0;
    this.cacheTtl = 5000; // 5 segundos
    this._writeQueue = Promise.resolve(); // Fila sequencial para evitar race conditions
    this._writeLock = false;
  }
  
  // ============================================================
  // INTERFACE PÚBLICA
  // ============================================================
  
  async connect() {
    if (this.type === 'json') {
      await this._ensureDataFile();
      return true;
    }
    // Futuro: PostgreSQL
    throw new Error('PostgreSQL not yet implemented');
  }
  
  async read() {
    // Cache com TTL
    const now = Date.now();
    if (this.cache && (now - this.lastRead) < this.cacheTtl) {
      return this._clone(this.cache);
    }
    
    if (this.type === 'json') {
      const data = await this._readJson();
      this.cache = data;
      this.lastRead = now;
      return this._clone(data);
    }
    
    throw new Error('Database type not supported');
  }
  
  async write(data) {
    if (this.type === 'json') {
      // Enfileirar writes para evitar race conditions
      const writeOp = async () => {
        try {
          this._writeLock = true;
          await this._writeJson(data);
          this.cache = this._clone(data);
          this.lastRead = Date.now();
          return true;
        } finally {
          this._writeLock = false;
        }
      };
      
      this._writeQueue = this._writeQueue.then(writeOp, writeOp);
      return this._writeQueue;
    }
    
    throw new Error('Database type not supported');
  }
  
  // ============================================================
  // MÉTODOS ESPECÍFICOS (abstraem queries)
  // ============================================================
  
  async findUserByEmail(email) {
    if (!email || typeof email !== 'string') return null;
    const normalizedEmail = email.toLowerCase().trim();
    const store = await this.read();
    return store.users.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
  }
  
  async findUserById(id) {
    const store = await this.read();
    return store.users.find(u => u.id === id);
  }
  
  async createUser(user) {
    const store = await this.read();
    store.users.push(user);
    await this.write(store);
    return user;
  }
  
  async findTransactionsByUser(userId, options = {}) {
    if (!userId) return { data: [], meta: { total: 0, limit: 0, offset: 0, hasMore: false } };
    const store = await this.read();
    // Só retorna transações do usuário específico (não mais as sem userId)
    let transactions = store.transactions.filter(t => t.userId === userId);
    
    // Pagination
    const limit = Math.min(options.limit || 50, 200);
    const offset = options.offset || 0;
    
    return {
      data: transactions.slice(offset, offset + limit),
      meta: {
        total: transactions.length,
        limit,
        offset,
        hasMore: offset + limit < transactions.length
      }
    };
  }
  
  async createTransaction(transaction) {
    const store = await this.read();
    store.transactions.push(transaction);
    await this.write(store);
    return transaction;
  }
  
  async updateTransaction(id, updates) {
    const store = await this.read();
    const index = store.transactions.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    store.transactions[index] = { ...store.transactions[index], ...updates };
    await this.write(store);
    return store.transactions[index];
  }
  
  async deleteTransaction(id) {
    const store = await this.read();
    const index = store.transactions.findIndex(t => t.id === id);
    if (index === -1) return false;
    
    store.transactions.splice(index, 1);
    await this.write(store);
    return true;
  }
  
  async findSessionByToken(token) {
    const store = await this.read();
    return store.sessions.find(s => s.token === token);
  }
  
  async createSession(session) {
    const store = await this.read();
    store.sessions.push(session);
    await this.write(store);
    return session;
  }
  
  async deleteSession(token) {
    const store = await this.read();
    store.sessions = store.sessions.filter(s => s.token !== token);
    await this.write(store);
    return true;
  }
  
  async pruneExpiredSessions() {
    const now = Date.now();
    const store = await this.read();
    const before = store.sessions.length;
    store.sessions = store.sessions.filter(s => {
      if (!s.expiresAt) return true; // Sem expiração = válida
      const expDate = Date.parse(s.expiresAt);
      if (isNaN(expDate)) return false; // Data inválida = remover
      return expDate > now;
    });
    const removed = before - store.sessions.length;
    if (removed > 0) {
      await this.write(store);
    }
    return removed;
  }
  
  // ============================================================
  // MÉTODOS PRIVADOS (JSON)
  // ============================================================
  
  async _ensureDataFile() {
    try {
      await fs.access(CONFIG.database.json.dataDir);
    } catch {
      await fs.mkdir(CONFIG.database.json.dataDir, { recursive: true });
    }
    
    try {
      await fs.access(this.dataPath);
    } catch {
      await fs.writeFile(this.dataPath, JSON.stringify(DEFAULT_STORE, null, 2));
    }
  }
  
  async _readJson() {
    try {
      const data = await fs.readFile(this.dataPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error('Error reading database:', e);
      return DEFAULT_STORE;
    }
  }
  
  async _writeJson(data) {
    // Write atomically
    const tempPath = this.dataPath + '.tmp';
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.rename(tempPath, this.dataPath);
    } catch (e) {
      // Tentar limpar arquivo temp em caso de erro
      try {
        await fs.unlink(tempPath);
      } catch (unlinkErr) {
        // Ignora erro de cleanup
      }
      throw e;
    }
  }
  
  _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
}

// Singleton
module.exports = new Database();
