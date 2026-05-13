// backend/middleware/validate.js — validação de corpo/query com Zod
import { z } from 'zod';

/**
 * Cria um middleware que valida req.body contra um schema Zod.
 * Em caso de erro retorna 422 com detalhes por campo.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        error: 'Dados inválidos',
        fields: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Cria um middleware que valida req.query contra um schema Zod.
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(422).json({
        error: 'Parâmetros inválidos',
        fields: result.error.flatten().fieldErrors,
      });
    }
    req.query = result.data;
    next();
  };
}

// ─── Schemas reutilizáveis ────────────────────────────────────────────────────

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email('Email inválido').toLowerCase(),
  password: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(128, 'Senha muito longa')
    .regex(
      /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
      'Senha deve conter pelo menos um número ou caractere especial',
    ),
});

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const transactionSchema = z.object({
  type: z.enum(['receita', 'despesa'], { message: 'Tipo deve ser receita ou despesa' }),
  amount: z.number().positive('Valor deve ser positivo'),
  description: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(80),
  subcategory: z.string().trim().max(80).optional(),
  date: z.string().datetime({ message: 'Data inválida (use ISO 8601)' }),
  accountId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().max(40)).max(10).default([]),
  notes: z.string().trim().max(1000).optional().nullable(),
  recurring: z.boolean().default(false),
});

export const transactionPatchSchema = transactionSchema.partial();

export const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['checking', 'savings', 'credit', 'investment']),
  balance: z.number().default(0),
  currency: z.string().length(3).default('BRL'),
  institution: z.string().trim().max(80).optional().nullable(),
});

export const budgetSchema = z.object({
  category: z.string().trim().min(1).max(80),
  limit: z.number().positive('Limite deve ser positivo'),
  period: z.enum(['monthly', 'weekly', 'yearly']).default('monthly'),
});

export const recurringSchema = z.object({
  type: z.enum(['receita', 'despesa']),
  amount: z.number().positive(),
  description: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(80).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional().nullable(),
  nextDue: z.string().datetime(),
});
