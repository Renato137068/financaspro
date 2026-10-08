# Incidente com dados pessoais

O que fazer se dados de usuários vazarem, forem acessados por quem não devia
ou forem perdidos. Escrito antes de precisar, porque no dia ninguém vai querer
descobrir o prazo da ANPD.

A LGPD (art. 48) pede que o controlador comunique a ANPD e as pessoas afetadas
quando o incidente puder trazer risco ou dano relevante. A Resolução CD/ANPD
nº 15/2024 fixa o prazo: **3 dias úteis** a partir de quando se fica sabendo
que o incidente envolveu dados pessoais. Agente de pequeno porte tem prazo em
dobro, mas não conte com isso: comece pelo prazo curto.

## O que conta como incidente aqui

- Chave `service_role` do Supabase, segredo do Stripe, da Play ou da Resend
  exposto (commit, log, print, máquina perdida).
- Uma política de RLS errada que deixe um usuário ler dados de outro.
- Acesso indevido ao painel do Supabase, do Stripe ou do Play Console.
- Dados de usuários apagados ou corrompidos sem backup.
- Relatório de erro (`fp_client_error`) que tenha gravado dado financeiro ou
  e-mail apesar da máscara.

Não é incidente com dados pessoais: o app fora do ar, um erro de cálculo que
não expôs nada, uma tentativa de ataque bloqueada.

## Nas primeiras horas: conter

1. **Troque o segredo vazado** antes de investigar. No Supabase:
   *Settings → API → Reset* da chave; nos demais, gere um novo segredo e
   atualize os secrets das Edge Functions (`supabase secrets set`) e do
   ambiente `production` do GitHub.
2. **Feche a porta.** Política de RLS errada: uma migração que a corrija, pelo
   caminho normal (`supabase db push`). Conta de painel invadida: troque a
   senha, revogue sessões e ligue a verificação em duas etapas.
3. **Guarde as provas** antes que a retenção apague: exporte os logs do
   Supabase (*Logs → API / Postgres / Edge Functions*) e a consulta que mostra
   o que foi acessado.

## Em até 1 dia útil: entender

Responda por escrito, num arquivo fora do repositório público:

- O que aconteceu e quando (início, descoberta, contenção).
- Que dados: e-mail, nome, lançamentos, assinatura? De quantas pessoas?
- Os dados estavam cifrados? (Lançamentos na nuvem não têm cifragem própria;
  comprovantes nunca sobem.)
- Quem teve acesso e o que pode fazer com isso.

## Em até 3 dias úteis: comunicar

**Precisa comunicar** se houver risco relevante: dados financeiros, credenciais
ou dados de muitas pessoas, acessados por alguém de fora. Na dúvida, comunique.

- **ANPD:** formulário de comunicação de incidente de segurança em
  gov.br/anpd. Pede a descrição do incidente, os dados e titulares afetados, as
  medidas tomadas e os riscos.
- **Pessoas afetadas:** um e-mail direto, em linguagem simples: o que
  aconteceu, que dados, o que já foi feito e o que a pessoa deve fazer (por
  exemplo, trocar a senha). Os e-mails estão em `auth.users`; para muita gente,
  um envio pela Resend.
- **Play Console:** só se o incidente mudar o que está declarado em Segurança
  dos dados.

Mesmo sem precisar comunicar, registre o incidente e a decisão: a ANPD pode
pedir o registro (Resolução nº 15/2024, art. 10), que deve ser guardado por
5 anos.

## Depois

- Um teste que teria pegado o problema (pgTAP para RLS, Jest para a máscara
  dos relatórios de erro).
- Atualizar este roteiro com o que faltou.

## Contatos

| Quem | Onde |
|---|---|
| Controlador (decide e comunica) | Renato José Soares, renato.soares1370@gmail.com |
| Supabase | painel → Support |
| ANPD | gov.br/anpd → Comunicação de incidente de segurança |
