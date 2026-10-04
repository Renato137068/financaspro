# ADR 0007 — Remover a API Express e dar destino ao que só existia nela

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

O ADR 0004 tornou o Supabase a fonte de verdade, congelou a API Express e
deixou a remoção de `backend/` para "um passo futuro e separado, depois de
decidir o destino de cada item". A reauditoria de 01/10/2026 (achado M1)
mostrou o custo de esperar:

- 8,6 mil linhas que ninguém deve mudar, rodando no `test:ci` em todo push
  (smoke, API e integração) e gerando imagem Docker a cada merge;
- dependências só dele, cada uma com a major atrasada: Prisma Client 5,
  Express 4, zod 3, otplib 12, bullmq e ioredis;
- o cliente `dados-express` (~11 KB) no boot da web, o que separava o JS
  inicial da meta de 450 KB.

Quatro peças existiam só no Express e precisavam de destino.

## Decisão

1. **Open Finance (Belvo) sai do escopo.** Está desligado no app desde
   setembro (`FEATURE_OPEN_FINANCE: false`), sem credencial de produção da
   Belvo e sem quem consiga testar o fluxo de ponta a ponta. Saem a rota, o
   cliente da Belvo, a tela e os domínios da Belvo na CSP. A tabela
   `OpenFinanceConnection` fica no schema (vazia) para não exigir migração
   destrutiva; voltar com o recurso é escrever uma Edge Function a partir do
   código que fica no histórico do git (`backend/lib/open-finance/`).

2. **Reconciliação de assinaturas: `pg_cron` + Edge Function.** O RTDN da Play
   e o webhook do Stripe cobrem o fluxo normal, mas aviso perdido é dinheiro:
   assinatura renovada que o banco dá por vencida tira o Pro de quem pagou, e
   cancelada que o banco dá por ativa entrega o Pro de graça. A função
   `billing-reconcile` roda uma vez por dia, disparada pelo `pg_cron` via
   `pg_net`, com segredo no Vault. É melhor que o worker do Express: em vez de
   revogar pela data, pergunta ao Google antes, e só revoga pela data se o
   Google não responder por mais de três dias.

3. **Retenção de dados: `pg_cron` com SQL puro.** `fp_purge_retention()`
   aplica os mesmos prazos do worker do Express, no próprio banco, sem Redis
   nem processo à parte. A exclusão de conta (`fp_delete_own_account`) passa a
   limpar IP e navegador do `AuditLog` que sobra, como o Express fazia.

4. **A web é hospedagem estática.** O `dist/` já é tudo que a web precisa:
   login, dados e cobrança falam direto com o Supabase. Os cabeçalhos que o
   Express mandava (segurança e cache) vão num arquivo `_headers`, formato
   aceito pelo Cloudflare Pages e pelo Netlify; a recomendação é o Cloudflare
   Pages (`docs/release/hospedagem-web.md`).

O que já tinha destino pelo ADR 0004 continua como estava: recorrentes são
materializadas pelo próprio app, e-mails de cobrança saem das Edge Functions,
login e 2FA são do Supabase Auth.

O Prisma continua dono do schema (ADR 0004, item 3): saem o Prisma Client e o
código que o usa, e ficam o `schema.prisma`, as migrações e o CLI, que o pgTAP
e o deploy usam.

## Consequências

- Uma regra de negócio de servidor tem um lugar só: SQL em
  `supabase/migrations/` ou Edge Function em `supabase/functions/`.
- O CI deixa de subir Redis, de rodar as suítes do Express e de gerar imagem
  Docker.
- O JS inicial perde o cliente da API e o caminho de sincronização v2, que só
  existia para ela.
- Quem hospedava a web com o Express precisa publicar o `dist/` num host
  estático antes de desligar o servidor.
- As tarefas agendadas dependem de `pg_cron`, `pg_net` e Vault, que o Supabase
  oferece; num Postgres sem eles a migração cria as funções e pula o
  agendamento, com aviso.
- Proibido: servidor Node próprio para regra de negócio. Se uma necessidade
  não couber em Edge Function ou SQL, ela vira um ADR novo.

## Alternativas consideradas

- **Portar o Open Finance para uma Edge Function agora.** Daria para escrever,
  mas não para testar: sem conta de produção na Belvo, o código nasceria sem
  ter rodado contra o serviço de verdade, e é o tipo de fluxo (consentimento,
  widget, importação) que quebra nos detalhes. Fica para quando o recurso for
  prioridade de produto.
- **Confiar só no RTDN e no webhook.** Menos uma peça, mas um RTDN perdido não
  tem outra chance: a Play só reenvia por alguns dias, e o banco ficaria errado
  até a pessoa reclamar.
- **Agendar pelo GitHub Actions** (como o alerta do painel de saúde). Funciona,
  mas põe uma tarefa de cobrança na disponibilidade do CI e espalha segredo de
  produção por mais um lugar. O `pg_cron` roda onde os dados estão.
- **Manter o Express só para servir a web.** Seria um servidor inteiro, com
  dependências e atualizações, para entregar arquivos estáticos.
