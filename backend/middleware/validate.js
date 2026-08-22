// backend/middleware/validate.js — validação de corpo/query com Zod
import { z } from 'zod';
import { assertTransferPayload } from '../domain/contracts/finance.contract.js';
import { MAX_AMOUNT } from '../lib/money.js';

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

/**
 * Cria um middleware que valida req.params contra um schema Zod.
 *
 * Sem isto, um `:id` que não seja UUID chega ao Prisma e vira
 * PrismaClientKnownRequestError — ou seja, um 500 para o que é, na verdade,
 * uma requisição malformada do cliente. Validar na borda devolve 400 e mantém
 * o log de erros do servidor limpo para falhas reais.
 *
 * Usa 400 (e não 422) porque o recurso identificado na URL não existe como
 * endereço válido — a distinção importa para métricas e alertas.
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({
        error: 'Identificador inválido na URL',
        fields: result.error.flatten().fieldErrors,
      });
    }
    Object.assign(req.params, result.data);
    next();
  };
}

// ─── Schemas reutilizáveis ────────────────────────────────────────────────────

// Todos os modelos do schema Prisma usam `@default(uuid())`, então qualquer
// identificador de recurso na URL é um UUID. Centralizar os schemas evita que
// uma rota nova esqueça a validação.
export const idParamSchema = z.object({
  id: z.string().uuid('Identificador deve ser um UUID'),
});

export const orgIdParamSchema = z.object({
  orgId: z.string().uuid('orgId deve ser um UUID'),
});

export const orgMemberParamSchema = z.object({
  orgId: z.string().uuid('orgId deve ser um UUID'),
  userId: z.string().uuid('userId deve ser um UUID'),
});

// Tokens de convite e verificação são hex de 64 caracteres (randomBytes(32)).
export const tokenParamSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/i, 'Token inválido'),
});

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

const transactionBodySchema = z.object({
  type: z.enum(['receita', 'despesa', 'transferencia'], {
    message: 'Tipo deve ser receita, despesa ou transferencia',
  }),
  amount: z.number().finite('Valor deve ser finito').positive('Valor deve ser positivo').max(MAX_AMOUNT, 'Valor acima do limite'),
  description: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(80),
  subcategory: z.string().trim().max(80).optional(),
  date: z.string().datetime({ message: 'Data inválida (use ISO 8601)' }),
  accountId: z.string().uuid().optional().nullable(),
  targetAccountId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().max(40)).max(10).default([]),
  notes: z.string().trim().max(1000).optional().nullable(),
  recurring: z.boolean().default(false),
});

export const transactionSchema = transactionBodySchema.superRefine((data, ctx) => {
  const err = assertTransferPayload(data);
  if (err) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ['type'] });
  }
});

export const transactionPatchSchema = transactionBodySchema.partial();

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
