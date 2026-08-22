/**
 * generate-openapi.mjs — gera docs/openapi.json a partir dos schemas Zod REAIS
 * (backend/middleware/validate.js) + um manifesto de rotas.
 *
 * Sem dependências novas: traz um conversor Zod→JSON Schema cobrindo os
 * construtos usados no projeto. A fonte da verdade dos corpos de request são os
 * mesmos schemas que a API valida em runtime — a doc não pode divergir da
 * validação real.
 *
 * Uso: npm run docs:openapi
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  registerSchema, loginSchema, transactionSchema,
  transactionPatchSchema, accountSchema, budgetSchema, recurringSchema,
  paginationSchema,
} from '../backend/middleware/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ─── Conversor Zod → JSON Schema ─────────────────────────────────────────────
function zodToJson(schema) {
  const def = schema?._def;
  if (!def) return {};
  switch (def.typeName) {
    case 'ZodObject': {
      const shape = def.shape();
      const properties = {};
      const required = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJson(value);
        if (!isOptional(value)) required.push(key);
      }
      const out = { type: 'object', properties };
      if (required.length) out.required = required;
      return out;
    }
    case 'ZodString': {
      const out = { type: 'string' };
      for (const c of def.checks || []) {
        if (c.kind === 'min') out.minLength = c.value;
        else if (c.kind === 'max') out.maxLength = c.value;
        else if (c.kind === 'email') out.format = 'email';
        else if (c.kind === 'uuid') out.format = 'uuid';
        else if (c.kind === 'datetime') out.format = 'date-time';
        else if (c.kind === 'length') { out.minLength = c.value; out.maxLength = c.value; }
        else if (c.kind === 'regex') out.pattern = c.regex.source;
      }
      return out;
    }
    case 'ZodNumber': {
      const out = { type: 'number' };
      for (const c of def.checks || []) {
        if (c.kind === 'int') out.type = 'integer';
        else if (c.kind === 'min') out.minimum = c.value;
        else if (c.kind === 'max') out.maximum = c.value;
      }
      // .positive() vira min inclusive/exclusivo em versões do zod; normaliza:
      if ((def.checks || []).some((c) => c.kind === 'min' && c.value === 0 && !c.inclusive)) {
        out.exclusiveMinimum = 0; delete out.minimum;
      }
      return out;
    }
    case 'ZodBoolean': return { type: 'boolean' };
    case 'ZodEnum': return { type: 'string', enum: def.values };
    case 'ZodArray': {
      const out = { type: 'array', items: zodToJson(def.type) };
      for (const c of def.checks ? [] : []) void c; // arrays: max é raro na doc
      if (def.maxLength) out.maxItems = def.maxLength.value;
      if (def.minLength) out.minItems = def.minLength.value;
      return out;
    }
    case 'ZodOptional':
    case 'ZodNullable': {
      const inner = zodToJson(def.innerType);
      if (def.typeName === 'ZodNullable') inner.nullable = true;
      return inner;
    }
    case 'ZodDefault': {
      const inner = zodToJson(def.innerType);
      try { inner.default = def.defaultValue(); } catch { /* ignore */ }
      return inner;
    }
    case 'ZodEffects': return zodToJson(def.schema); // .trim()/.toLowerCase()/.refine()
    default: return {};
  }
}

// Um campo é opcional se a cadeia contém .optional() ou .default() — mesmo
// embrulhado por .nullable()/.trim()/.refine(). `.nullable()` sozinho continua
// obrigatório (deve estar presente, podendo ser null).
function isOptional(schema) {
  const def = schema?._def;
  if (!def) return false;
  const t = def.typeName;
  if (t === 'ZodOptional' || t === 'ZodDefault') return true;
  if (t === 'ZodNullable') return isOptional(def.innerType);
  if (t === 'ZodEffects') return isOptional(def.schema);
  return false;
}

// ─── Manifesto de rotas (lido dos arquivos backend/routes/*.js) ──────────────
const bearer = [{ bearerAuth: [] }];
const P = (summary, extra = {}) => ({ summary, ...extra });

function crud(tag, name, createSchema, patchSchema) {
  const path = `/${name}`;
  return {
    [path]: {
      get: { tags: [tag], summary: `Listar ${tag}`, security: bearer },
      post: { tags: [tag], summary: `Criar ${tag}`, security: bearer, requestBody: body(createSchema) },
    },
    [`${path}/{id}`]: {
      get: { tags: [tag], summary: `Obter ${tag} por id`, security: bearer, parameters: [idParam] },
      patch: { tags: [tag], summary: `Atualizar ${tag}`, security: bearer, parameters: [idParam], requestBody: body(patchSchema) },
      delete: { tags: [tag], summary: `Excluir ${tag}`, security: bearer, parameters: [idParam] },
    },
  };
}

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const orgIdParam = { name: 'orgId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const userIdParam = { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const tokenParam = { name: 'token', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-f]{64}$' } };
function body(schema) {
  return { required: true, content: { 'application/json': { schema: zodToJson(schema) } } };
}

const paths = {
  '/auth/register': { post: { ...P('Registrar novo usuário'), tags: ['Auth'], requestBody: body(registerSchema) } },
  '/auth/login': { post: { ...P('Login (retorna access token + refresh cookie)'), tags: ['Auth'], requestBody: body(loginSchema) } },
  '/auth/refresh': { post: { ...P('Renovar access token via refresh cookie'), tags: ['Auth'] } },
  '/auth/logout': { post: { ...P('Encerrar sessão'), tags: ['Auth'] } },
  '/auth/me': { get: { ...P('Dados do usuário autenticado'), tags: ['Auth'], security: bearer } },
  '/auth/totp/setup': { post: { ...P('Iniciar configuração de 2FA (QR/secret)'), tags: ['Auth'], security: bearer } },
  '/auth/totp/enable': { post: { ...P('Ativar 2FA'), tags: ['Auth'], security: bearer } },
  ...crud('transactions', 'transactions', transactionSchema, transactionPatchSchema),
  ...crud('accounts', 'accounts', accountSchema, accountSchema.partial()),
  ...crud('budgets', 'budgets', budgetSchema, budgetSchema.partial()),
  ...crud('recorrentes', 'recorrentes', recurringSchema, recurringSchema.partial()),

  // ─── Auth: recuperação de senha e verificação de e-mail ────────────────────
  '/auth/forgot-password': { post: { ...P('Solicitar link de redefinição de senha'), tags: ['Auth'] } },
  '/auth/reset-password': { post: { ...P('Redefinir senha com o token recebido por e-mail'), tags: ['Auth'] } },
  '/auth/verify-email': { post: { ...P('Confirmar endereço de e-mail'), tags: ['Auth'] } },
  '/auth/resend-verification': { post: { ...P('Reenviar e-mail de verificação'), tags: ['Auth'] } },
  '/auth/totp/verify': { post: { ...P('Concluir login enviando o código de 2FA'), tags: ['Auth'] } },
  '/auth/totp/status': { get: { ...P('Saber se o 2FA está ativo'), tags: ['Auth'], security: bearer } },
  '/auth/totp/disable': { post: { ...P('Desativar 2FA'), tags: ['Auth'], security: bearer } },

  // ─── Usuário: perfil, configuração e direitos de LGPD ──────────────────────
  '/users': { get: { ...P('Listar usuários (ADMIN)'), tags: ['Usuários'], security: bearer } },
  '/users/me': {
    get: { ...P('Perfil do usuário autenticado'), tags: ['Usuários'], security: bearer },
    patch: { ...P('Atualizar nome e preferências do perfil'), tags: ['Usuários'], security: bearer },
    delete: { ...P('Excluir a conta (LGPD art. 18, VI) — anonimiza o log de auditoria'), tags: ['Usuários'], security: bearer },
  },
  '/users/me/config': {
    get: { ...P('Ler a configuração do app'), tags: ['Usuários'], security: bearer },
    put: { ...P('Gravar a configuração do app'), tags: ['Usuários'], security: bearer },
  },
  '/users/me/password': { post: { ...P('Trocar a própria senha'), tags: ['Usuários'], security: bearer } },
  '/users/me/export': { get: { ...P('Exportar todos os dados pessoais em JSON (LGPD art. 18, V)'), tags: ['Usuários'], security: bearer } },
  '/users/{id}': { patch: { ...P('Alterar papel ou situação de um usuário (ADMIN)'), tags: ['Usuários'], security: bearer, parameters: [idParam] } },

  // ─── Sincronização e estado agregado ──────────────────────────────────────
  '/state': { get: { ...P('Estado consolidado do usuário para hidratar o app'), tags: ['Sync'], security: bearer } },
  '/sync': {
    get: { ...P('Delta desde um cursor — devolve alterações e tombstones'), tags: ['Sync'], security: bearer },
    post: { ...P('Enviar o lote da outbox; resolve conflitos e devolve o veredito por operação'), tags: ['Sync'], security: bearer },
  },

  // ─── Organizações (multi-tenant) ──────────────────────────────────────────
  '/orgs': {
    get: { ...P('Listar organizações de que o usuário participa'), tags: ['Orgs'], security: bearer },
    post: { ...P('Criar organização'), tags: ['Orgs'], security: bearer },
  },
  '/orgs/{orgId}': {
    get: { ...P('Detalhes da organização'), tags: ['Orgs'], security: bearer, parameters: [orgIdParam] },
    patch: { ...P('Atualizar a organização (papel mínimo: ADMIN)'), tags: ['Orgs'], security: bearer, parameters: [orgIdParam] },
    delete: { ...P('Excluir a organização (apenas o dono)'), tags: ['Orgs'], security: bearer, parameters: [orgIdParam] },
  },
  '/orgs/{orgId}/invite': { post: { ...P('Convidar alguém — respeita o limite de assentos do plano'), tags: ['Orgs'], security: bearer, parameters: [orgIdParam] } },
  '/orgs/{orgId}/invitations': { get: { ...P('Listar convites pendentes'), tags: ['Orgs'], security: bearer, parameters: [orgIdParam] } },
  '/orgs/invitations/{token}/accept': { post: { ...P('Aceitar um convite'), tags: ['Orgs'], security: bearer, parameters: [tokenParam] } },
  '/orgs/{orgId}/members/{userId}': {
    patch: { ...P('Mudar o papel de um membro'), tags: ['Orgs'], security: bearer, parameters: [orgIdParam, userIdParam] },
    delete: { ...P('Remover um membro'), tags: ['Orgs'], security: bearer, parameters: [orgIdParam, userIdParam] },
  },
  '/orgs/{orgId}/members/{userId}/transfer-ownership': { post: { ...P('Transferir a propriedade da organização'), tags: ['Orgs'], security: bearer, parameters: [orgIdParam, userIdParam] } },

  // ─── Billing (Stripe) ─────────────────────────────────────────────────────
  '/billing/plans': { get: { ...P('Planos disponíveis e seus limites'), tags: ['Billing'] } },
  '/billing/{orgId}/subscription': { get: { ...P('Assinatura atual da organização'), tags: ['Billing'], security: bearer, parameters: [orgIdParam] } },
  '/billing/{orgId}/subscribe': { post: { ...P('Assinar um plano'), tags: ['Billing'], security: bearer, parameters: [orgIdParam] } },
  '/billing/{orgId}/checkout': { post: { ...P('Abrir sessão de checkout do Stripe'), tags: ['Billing'], security: bearer, parameters: [orgIdParam] } },
  '/billing/{orgId}/portal': { post: { ...P('Abrir o portal de cobrança do Stripe'), tags: ['Billing'], security: bearer, parameters: [orgIdParam] } },
  '/billing/{orgId}/cancel': { post: { ...P('Cancelar ao fim do período vigente'), tags: ['Billing'], security: bearer, parameters: [orgIdParam] } },
  '/billing/{orgId}/invoices': { get: { ...P('Faturas emitidas'), tags: ['Billing'], security: bearer, parameters: [orgIdParam] } },

  // ─── Open Finance ─────────────────────────────────────────────────────────
  '/open-finance/providers': { get: { ...P('Provedores disponíveis (Belvo, sandbox)'), tags: ['Open Finance'], security: bearer } },
  '/open-finance/connections': {
    get: { ...P('Conexões bancárias do usuário'), tags: ['Open Finance'], security: bearer },
    post: { ...P('Criar conexão bancária'), tags: ['Open Finance'], security: bearer },
  },
  '/open-finance/connections/{id}': { delete: { ...P('Remover conexão bancária'), tags: ['Open Finance'], security: bearer, parameters: [idParam] } },
  '/open-finance/connections/{id}/sync': { post: { ...P('Importar lançamentos — deduplica por openFinanceId'), tags: ['Open Finance'], security: bearer, parameters: [idParam] } },
  '/open-finance/belvo/widget-token': { post: { ...P('Token de acesso ao widget da Belvo'), tags: ['Open Finance'], security: bearer } },
  '/open-finance/belvo/complete': { post: { ...P('Concluir o vínculo após o widget'), tags: ['Open Finance'], security: bearer } },

  // ─── Operação ─────────────────────────────────────────────────────────────
  '/health': { get: { ...P('Health check (db, redis, workers, lag do event loop)'), tags: ['Ops'] } },
  '/metrics': { get: { ...P('Métricas Prometheus (requer METRICS_TOKEN)'), tags: ['Ops'], security: bearer } },
  '/metrics.json': { get: { ...P('As mesmas métricas em JSON'), tags: ['Ops'], security: bearer } },
};

// Adiciona paginação como query params nas listagens
for (const p of ['/transactions']) {
  paths[p].get.parameters = Object.entries(zodToJson(paginationSchema).properties).map(([n, s]) => ({
    name: n, in: 'query', required: false, schema: s,
  }));
}

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'FinançasPro API',
    version: '11.0.0',
    description: 'API SaaS de finanças pessoais. Corpos de request gerados a partir dos schemas Zod que a API valida em runtime.',
  },
  servers: [{ url: '/api/v1', description: 'API v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  tags: [
    { name: 'Auth', description: 'Autenticação, sessão e 2FA' },
    { name: 'transactions', description: 'Lançamentos financeiros' },
    { name: 'accounts', description: 'Contas' },
    { name: 'budgets', description: 'Orçamentos' },
    { name: 'recorrentes', description: 'Recorrências' },
    { name: 'Usuários', description: 'Perfil, configuração e direitos de LGPD' },
    { name: 'Sync', description: 'Delta, outbox e estado agregado' },
    { name: 'Orgs', description: 'Organizações, membros e convites' },
    { name: 'Billing', description: 'Planos, assinatura e faturas (Stripe)' },
    { name: 'Open Finance', description: 'Conexões bancárias e importação' },
    { name: 'Ops', description: 'Saúde e observabilidade' },
  ],
  paths,
};

const outFile = join(root, 'docs', 'openapi.json');
writeFileSync(outFile, JSON.stringify(doc, null, 2));

// ─── Viewer HTML autocontido (spec inline) ───────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const METHOD_COLORS = { get: '#0891b2', post: '#16a34a', patch: '#d97706', put: '#7c3aed', delete: '#dc2626' };

function fieldRows(schema) {
  if (!schema || !schema.properties) return '';
  const req = new Set(schema.required || []);
  return Object.entries(schema.properties).map(([name, s]) => {
    const constraints = [];
    if (s.enum) constraints.push('enum: ' + s.enum.join(' | '));
    if (s.format) constraints.push(s.format);
    if (s.minLength != null) constraints.push('min ' + s.minLength);
    if (s.maxLength != null) constraints.push('max ' + s.maxLength);
    if (s.exclusiveMinimum != null) constraints.push('> ' + s.exclusiveMinimum);
    if (s.minimum != null) constraints.push('≥ ' + s.minimum);
    if (s.maximum != null) constraints.push('≤ ' + s.maximum);
    if (s.default !== undefined) constraints.push('default: ' + JSON.stringify(s.default));
    if (s.nullable) constraints.push('nullable');
    const type = s.type + (s.items ? `<${s.items.type || 'any'}>` : '');
    return `<tr><td class="fn">${esc(name)}${req.has(name) ? '<span class="req">*</span>' : ''}</td>`
      + `<td class="ft">${esc(type)}</td><td class="fc">${esc(constraints.join(' · '))}</td></tr>`;
  }).join('');
}

function opBlock(path, method, op) {
  const bodySchema = op.requestBody?.content?.['application/json']?.schema;
  const params = op.parameters || [];
  const rows = fieldRows(bodySchema);
  const paramRows = params.map((p) => `<tr><td class="fn">${esc(p.name)}<span class="pin">${p.in}</span>${p.required ? '<span class="req">*</span>' : ''}</td>`
    + `<td class="ft">${esc(p.schema?.type || '')}</td><td class="fc">${esc((p.schema?.enum ? 'enum: ' + p.schema.enum.join(' | ') : '') || (p.schema?.default !== undefined ? 'default: ' + JSON.stringify(p.schema.default) : ''))}</td></tr>`).join('');
  return `<div class="op">
    <div class="op-head">
      <span class="m" style="background:${METHOD_COLORS[method]}">${method.toUpperCase()}</span>
      <code class="path">/api/v1${esc(path)}</code>
      ${op.security ? '<span class="auth" title="Requer Bearer JWT">🔒</span>' : ''}
      <span class="sum">${esc(op.summary || '')}</span>
    </div>
    ${paramRows ? `<div class="tbl-wrap"><div class="tbl-t">Parâmetros</div><table><thead><tr><th>Nome</th><th>Tipo</th><th>Regras</th></tr></thead><tbody>${paramRows}</tbody></table></div>` : ''}
    ${rows ? `<div class="tbl-wrap"><div class="tbl-t">Corpo (application/json)</div><table><thead><tr><th>Campo</th><th>Tipo</th><th>Regras</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
  </div>`;
}

const byTag = {};
for (const [path, ops] of Object.entries(paths)) {
  for (const [method, op] of Object.entries(ops)) {
    const tag = (op.tags && op.tags[0]) || 'Outros';
    (byTag[tag] = byTag[tag] || []).push(opBlock(path, method, op));
  }
}
const sections = (doc.tags || []).map((t) => byTag[t.name] ? `<section><h2>${esc(t.name)}</h2><p class="td">${esc(t.description || '')}</p>${byTag[t.name].join('')}</section>` : '').join('');

const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FinançasPro API — Referência</title><style>
:root{--bg:#f6f7fb;--card:#fff;--ink:#1a1d29;--mut:#5b6472;--line:#e6e8ef;--brand:#4f46e5}
@media(prefers-color-scheme:dark){:root{--bg:#0e1017;--card:#171a24;--ink:#eef0f6;--mut:#9aa3b2;--line:#262a37}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5}
.wrap{max-width:900px;margin:0 auto;padding:28px 18px 70px}
header{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border-radius:14px;padding:24px}
header h1{margin:0 0 4px;font-size:23px}header p{margin:0;opacity:.9;font-size:14px}
header .v{display:inline-block;margin-top:10px;background:rgba(255,255,255,.15);padding:3px 10px;border-radius:20px;font-size:12px}
h2{font-size:18px;margin:30px 0 2px}.td{color:var(--mut);font-size:13px;margin:0 0 12px}
.op{background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:10px;overflow:hidden}
.op-head{display:flex;align-items:center;gap:10px;padding:11px 14px;flex-wrap:wrap}
.m{color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:5px;min-width:52px;text-align:center}
.path{font-size:13.5px;font-weight:600}.sum{color:var(--mut);font-size:13px;margin-left:auto}.auth{font-size:12px}
.tbl-wrap{border-top:1px solid var(--line);padding:10px 14px;overflow-x:auto}
.tbl-t{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--mut);margin-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;font-size:11px;color:var(--mut);font-weight:600;padding:4px 8px}
td{padding:5px 8px;border-top:1px solid var(--line);vertical-align:top}.fn{font-weight:600;font-family:ui-monospace,monospace;font-size:12.5px}
.ft{color:var(--brand);font-family:ui-monospace,monospace;font-size:12.5px}.fc{color:var(--mut);font-size:12px}
.req{color:#dc2626;margin-left:2px}.pin{background:var(--line);color:var(--mut);font-size:10px;padding:1px 5px;border-radius:4px;margin-left:5px}
.foot{color:var(--mut);font-size:12px;text-align:center;margin-top:30px}code{font-family:ui-monospace,monospace}
</style></head><body><div class="wrap">
<header><h1>${esc(doc.info.title)}</h1><p>${esc(doc.info.description)}</p><span class="v">v${esc(doc.info.version)} · OpenAPI ${doc.openapi} · base <code>/api/v1</code></span></header>
${sections}
<div class="foot">Gerado por <code>scripts/generate-openapi.mjs</code> a partir dos schemas Zod de <code>backend/middleware/validate.js</code>. Spec: <code>docs/openapi.json</code>.<br>* = obrigatório · 🔒 = requer Bearer JWT</div>
</div></body></html>`;

writeFileSync(join(root, 'docs', 'api-reference.html'), html);

const endpoints = Object.values(paths).reduce((n, p) => n + Object.keys(p).length, 0);
console.log(`[openapi] ${Object.keys(paths).length} paths, ${endpoints} operações → docs/openapi.json + docs/api-reference.html`);
