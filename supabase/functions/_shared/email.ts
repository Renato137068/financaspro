// supabase/functions/_shared/email.ts
// Templates de billing/equipe + envio via Resend (fallback: log).
type Payload = Record<string, unknown>;

function appBase(): string {
  return (Deno.env.get("APP_URL") || "https://financaspro.app").replace(/\/$/, "");
}

export function renderEmail(
  templateName: string,
  payload: Payload,
): { subject: string; text: string } | null {
  const to = String(payload.to || "");
  if (!to) return null;

  switch (templateName) {
    case "subscription-activated":
      return {
        subject: `Assinatura ${payload.planName || "Pro"} ativada!`,
        text: [
          "Parabéns!",
          "",
          `Sua assinatura do plano ${payload.planName || "Pro"} foi ativada com sucesso.`,
          payload.nextBilling
            ? `Próxima cobrança: ${new Date(String(payload.nextBilling)).toLocaleDateString("pt-BR")}`
            : "",
          "",
          "Aproveite o Pro: sync sem limites, IA e exportação na nuvem.",
        ].filter(Boolean).join("\n"),
      };
    case "subscription-canceled":
      return {
        subject: "Assinatura cancelada",
        text: [
          "Olá,",
          "",
          `Sua assinatura do plano ${payload.planName || ""} foi cancelada.`,
          payload.accessUntil
            ? `Você terá acesso ao plano até: ${new Date(String(payload.accessUntil)).toLocaleDateString("pt-BR")}`
            : "",
        ].filter(Boolean).join("\n"),
      };
    case "payment-failed":
      return {
        subject: "Falha no pagamento — FinançasPro",
        text: [
          "Olá,",
          "",
          "Não foi possível processar o pagamento da sua assinatura.",
          "Atualize seu método de pagamento para continuar usando o FinançasPro.",
          "",
          `Acesse: ${appBase()}`,
        ].join("\n"),
      };
    case "invite-member": {
      const token = String(payload.token || "");
      const link = token
        ? `${appBase()}?invite=${encodeURIComponent(token)}`
        : appBase();
      return {
        subject: `Convite para ${payload.orgName || "FinançasPro"}`,
        text: [
          "Olá!",
          "",
          `Você foi convidado para participar de "${payload.orgName || "uma organização"}" no FinançasPro.`,
          "",
          "Abra o link (com a mesma conta de e-mail) para aceitar:",
          link,
          "",
          "O convite expira em 7 dias.",
        ].join("\n"),
      };
    }
    default:
      return null;
  }
}

/** Envia via Resend se RESEND_API_KEY existir; senão só loga (dev/CI). */
export async function notify(
  templateName: string,
  payload: Payload,
): Promise<{ ok: boolean; simulated?: boolean; id?: string }> {
  const rendered = renderEmail(templateName, payload);
  if (!rendered) {
    console.log(`[email:${templateName}] skip-empty`, JSON.stringify(payload));
    return { ok: false, simulated: true };
  }

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM") || "FinançasPro <onboarding@resend.dev>";

  if (!key) {
    console.log(
      `[email:${templateName}]`,
      JSON.stringify({ to: payload.to, subject: rendered.subject, preview: rendered.text.slice(0, 120) }),
    );
    return { ok: true, simulated: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [String(payload.to)],
      subject: rendered.subject,
      text: rendered.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[email:${templateName}] resend-fail`, res.status, body);
    return { ok: false };
  }

  const data = await res.json().catch(() => ({}));
  console.log(`[email:${templateName}] sent`, data?.id || "");
  return { ok: true, id: data?.id };
}
