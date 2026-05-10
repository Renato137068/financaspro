/**
 * backend/lib/auth.js - Serviço de autenticação
 * Separação de responsabilidades: auth é isolado
 */

const crypto = require('crypto');
const CONFIG = require('../config');
const db = require('./database');

class AuthService {
  // ============================================================
  // HASH E CRYPTO
  // ============================================================
  
  hashPassword(password, salt) {
    return crypto.pbkdf2Sync(
      password, 
      Buffer.from(salt, 'hex'), 
      CONFIG.auth.pbkdf2Iterations, 
      32, 
      'sha256'
    ).toString('hex');
  }
  
  generateSalt() {
    return crypto.randomBytes(CONFIG.auth.saltLength).toString('hex');
  }
  
  verifyPassword(password, salt, hash) {
    const candidate = this.hashPassword(password, salt);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(candidate, 'hex'),
        Buffer.from(hash, 'hex')
      );
    } catch {
      return false;
    }
  }
  
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }
  
  generateUUID() {
    return crypto.randomUUID();
  }
  
  // ============================================================
  // VALIDAÇÃO
  // ============================================================
  
  validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  
  validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required' };
    }
    if (password.length < 6) {
      return { valid: false, error: 'Password must be at least 6 characters' };
    }
    if (password.length > 128) {
      return { valid: false, error: 'Password too long' };
    }
    return { valid: true };
  }
  
  normalizeEmail(email) {
    return email.trim().toLowerCase();
  }
  
  normalizeName(name) {
    return (name || 'Usuario').trim().slice(0, 80) || 'Usuario';
  }
  
  // ============================================================
  // OPERAÇÕES DE AUTH
  // ============================================================
  
  async register({ email, password, name }) {
    // Validações
    if (!this.validateEmail(email)) {
      return { success: false, error: 'Invalid email', status: 400 };
    }
    
    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.error, status: 400 };
    }
    
    const normalizedEmail = this.normalizeEmail(email);
    
    // Verificar duplicado
    const existingUser = await db.findUserByEmail(normalizedEmail);
    if (existingUser) {
      return { success: false, error: 'Email already registered', status: 409 };
    }
    
    // Criar usuário
    const salt = this.generateSalt();
    const user = {
      id: this.generateUUID(),
      name: this.normalizeName(name),
      email: normalizedEmail,
      passwordSalt: salt,
      passwordHash: this.hashPassword(password, salt),
      createdAt: new Date().toISOString()
    };
    
    await db.createUser(user);
    
    // Retornar sem dados sensíveis
    const { passwordSalt, passwordHash, ...publicUser } = user;
    return { success: true, data: publicUser, status: 201 };
  }
  
  async login({ email, password }) {
    if (!email || !password) {
      return { success: false, error: 'Email and password required', status: 400 };
    }
    
    const normalizedEmail = this.normalizeEmail(email);
    const user = await db.findUserByEmail(normalizedEmail);
    
    if (!user) {
      return { success: false, error: 'Invalid credentials', status: 401 };
    }
    
    const valid = this.verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!valid) {
      return { success: false, error: 'Invalid credentials', status: 401 };
    }
    
    // Criar sessão
    const token = this.generateToken();
    const session = {
      token,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + CONFIG.auth.sessionDuration).toISOString()
    };
    
    await db.createSession(session);
    await db.pruneExpiredSessions();
    
    const { passwordSalt, passwordHash, ...publicUser } = user;
    return { 
      success: true, 
      data: { token, user: publicUser },
      status: 200 
    };
  }
  
  async logout(token) {
    await db.deleteSession(token);
    return { success: true, status: 200 };
  }
  
  async authenticateRequest(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    
    if (!token) {
      return { authenticated: false, error: 'No token provided' };
    }
    
    await db.pruneExpiredSessions();
    const session = await db.findSessionByToken(token);
    
    if (!session) {
      return { authenticated: false, error: 'Invalid or expired token' };
    }
    
    const user = await db.findUserById(session.userId);
    if (!user) {
      return { authenticated: false, error: 'User not found' };
    }
    
    const { passwordSalt, passwordHash, ...publicUser } = user;
    return { authenticated: true, user: publicUser, session };
  }
  
  requireAuth(req) {
    return async (req, res, next) => {
      const auth = await this.authenticateRequest(req);
      if (!auth.authenticated) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: auth.error }));
        return;
      }
      req.user = auth.user;
      next();
    };
  }
}

module.exports = new AuthService();
