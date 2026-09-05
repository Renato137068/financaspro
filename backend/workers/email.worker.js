// backend/workers/email.worker.js — envia e-mails transacionais e de sistema
import { Worker } from 'bullmq';
import logger from '../lib/logger.js';
import { QUEUES } from '../lib/queue.js';
import CONFIG from '../config.js';

// Templates de e-mail disponíveis (exportado para teste de conteúdo)
export const TEMPLATES = {
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
      `${CONFIG.appUrl}?invite=${data.token}`,
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
      `Aproveite o Pro: sync sem limites, IA e exportação na nuvem.`,
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

  // Sem interpolação de dados: mensagem genérica de propósito, para não expor
  // valor cobrado nem últimos dígitos do cartão num e-mail.
  'payment-failed': (_data) => ({
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

  'password-reset': (data) => ({
    subject: `Redefinição de senha — FinançasPro`,
    text: [
      `Olá${data.name ? ', ' + data.name : ''}!`,
      ``,
      `Recebemos um pedido para redefinir a senha da sua conta.`,
      `Clique no link abaixo para criar uma nova senha:`,
      `${data.url}`,
      ``,
      `O link expira em ${data.expiresMin || 60} minutos e só pode ser usado uma vez.`,
      `Se você não solicitou, ignore este e-mail — sua senha continua a mesma.`,
    ].join('\n'),
  }),

  'email-verify': (data) => ({
    subject: `Confirme seu e-mail — FinançasPro`,
    text: [
      `Olá${data.name ? ', ' + data.name : ''}!`,
      ``,
      `Bem-vindo(a) ao FinançasPro. Confirme seu e-mail clicando no link:`,
      `${data.url}`,
      ``,
      `O link expira em ${data.expiresHours || 24} horas.`,
    ].join('\n'),
  }),
};

/**
 * Renderiza e envia um e-mail a partir do nome do template.
 *
 * Exportada junto com TEMPLATES para teste: o conteúdo de e-mail transacional
 * é a parte do sistema que o usuário mais lê e que menos alguém revisa — vale
 * garantir que valores monetários e datas saiam formatados e que um template
 * inexistente não derrube o worker.
 */
export async function sendEmail(job) {
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
