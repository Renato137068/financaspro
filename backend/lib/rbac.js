// backend/lib/rbac.js — controle de acesso baseado em papel (RBAC)

/**
 * Mapa de permissões por role.
 * Cada permissão é uma string no formato "resource:action".
 */
const PERMISSIONS = {
  ADMIN: [
    'users:read',
    'users:write',
    'users:delete',
    'transactions:read',
    'transactions:write',
    'transactions:delete',
    'accounts:read',
    'accounts:write',
    'accounts:delete',
    'budgets:read',
    'budgets:write',
    'budgets:delete',
    'recurring:read',
    'recurring:write',
    'recurring:delete',
    'audit:read',
    'config:read',
    'config:write',
  ],
  USER: [
    'transactions:read',
    'transactions:write',
    'transactions:delete',
    'accounts:read',
    'accounts:write',
    'accounts:delete',
    'budgets:read',
    'budgets:write',
    'budgets:delete',
    'recurring:read',
    'recurring:write',
    'recurring:delete',
    'config:read',
    'config:write',
  ],
  VIEWER: [
    'transactions:read',
    'accounts:read',
    'budgets:read',
    'recurring:read',
    'config:read',
  ],
};

/**
 * Verifica se um role possui a permissão especificada.
 */
export function hasPermission(role, permission) {
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Middleware Express: exige que o usuário autenticado possua a permissão.
 * Deve ser usado após o middleware `authenticate`.
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ error: 'Permissão insuficiente', required: permission });
    }
    next();
  };
}

/**
 * Middleware Express: exige role mínimo (hierarquia: ADMIN > USER > VIEWER).
 */
const ROLE_RANK = { ADMIN: 3, USER: 2, VIEWER: 1 };

export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if ((ROLE_RANK[req.user.role] ?? 0) < (ROLE_RANK[minRole] ?? 99)) {
      return res.status(403).json({ error: 'Acesso negado', required: minRole });
    }
    next();
  };
}
