// backend/workers/email.worker.js — envia e-mails transacionais e de sistema
import { Worker } from 'bullmq';
import logger from '../lib/logger.js';
import { QUEUES } from '../lib/queue.js';
import CONFIG from '../config.js';

// Templates de e-mail disponíveis
const TEMPLATES = {
  'recurring-processed': (data) => ({
    subject: `Transação recorrente: ${data.description}`,
    text: [
      `Olá!`,
      ``,
      `Uma transação recorrente foi lançada automaticamente:`,
      `Descrição: ${data.description}`,
      `Valor: R$ ${parseFloat(data.amount).toFixed(2)}`,
      `Tipo: ${data.type === 'expense' ? 'Despesa' : 'Receita'}`,
      `Data: ${new Date(data.date).toLocaleDateString('pt-BR')}`,
      ``,
      `Acesse o FinançasPro para mais detalhes.`,
    ].join('\n'),
  }),

  'invite-member': (data) => ({
    subject: `Convite para ${data.orgName} no FinançasPro`,
    text: [
      `Olá!`,
      ``,
      `Você foi convidado para participar da organização "${data.orgName}" no FinançasPro.`,
      ``,
      `Clique no link para aceitar o convite:`,
      `${CONFIG.appUrl}/invite/${data.token}`,
      ``,
      `O convite expira em 7 dias.`,
    ].join('\n'),
  }),

  'subscription-activated': (data) => ({
    subject: `Assinatura ${data.planName} ativada!`,
    text: [
      `Parabéns!`,
      ``,
      `Sua assinatura do plano ${data.planName} foi ativada com sucesso.`,
      `Próxima cobrança: ${new Date(data.nextBilling).toLocaleDateString('pt-BR')}`,
      ``,
      `Aproveite todos os recursos do FinançasPro!`,
    ].join('\n'),
  }),

  'subscription-canceled': (data) => ({
    subject: `Assinatura cancelada`,
    text: [
      `Olá,`,
      ``,
      `Sua assinatura do plano ${data.planName} foi cancelada.`,
      `Você terá acesso ao plano até: ${new Date(data.accessUntil).toLocaleDateString('pt-BR')}`,
    ].join('\n'),
  }),

  'payment-failed': (data) => ({
    subject: `Falha no pagamento — FinançasPro`,
    text: [
      `Olá,`,
      ``,
      `Não foi possível processar o pagamento da sua assinatura.`,
      `Por favor, atualize seu método de pagamento para continuar usando o FinançasPro.`,
      ``,
      `Acesse: ${CONFIG.appUrl}/billing`,
    ].join('\n'),
  }),
};

async function sendEmail(job) {
  const { to, templateName, data } = job.data;

  const template = TEMPLATES[templateName];
  if (!template) {
    logger.warn({ templateName }, 'Template de e-mail não encontrado');
    return;
  }

  const { subject, text } = template(data);

  // Em desenvolvimento, apenas loga o e-mail
  if (!CONFIG.isProd || !CONFIG.email?.host) {
    logger.info({ to, subject, preview: text.slice(0, 120) }, '[DEV] E-mail simulado');
    return { simulated: true };
  }

  // Em produção, usa nodemailer com SMTP configurado
  const { createTransport } = await import('nodemailer');
  const transporter = createTransport({
    host:   CONFIG.email.host,
    port:   CONFIG.email.port,
    secure: CONFIG.email.secure,
    auth:   { user: CONFIG.email.user, pass: CONFIG.email.pass },
  });

  const info = await transporter.sendMail({
    from:    CONFIG.email.from,
    to,
    subject,
    text,
  });

  logger.info({ to, subject, messageId: info.messageId }, 'E-mail enviado');
  return { messageId: info.messageId };
}

export function startEmailWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(QUEUES.EMAIL, sendEmail, {
    connection,
    concurrency: 10,
  });

  worker.on('completed', (job) =>
    logger.debug({ jobId: job.id, template: job.data.templateName }, 'E-mail enviado')
  );

  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err }, 'Falha ao enviar e-mail')
  );

  logger.info('Worker email iniciado');
  return worker;
}
