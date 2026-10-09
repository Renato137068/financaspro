# Alerta semanal dos Android vitals

O Google mede sozinho os travamentos nativos e os "app não responde" (ANR) de
quem instalou pela Play. Acima de **1,09%** de usuários com travamento ou
**0,47%** com ANR (média de 7 dias), a Play considera o app de mau
comportamento e reduz a visibilidade dele na loja.

O workflow **Android vitals** (`.github/workflows/vitals.yml`) lê essas duas
taxas toda segunda-feira e abre a issue "Android vitals acima do limite da Play"
quando alguma passa do limite. O relatório também sai no resumo da execução.

## Para ligar (uma vez, no Google)

Ele usa a mesma conta de serviço da ficha e do release
(`PLAY_SERVICE_ACCOUNT_JSON`). Até estes dois passos, o job sai verde com um
aviso e não faz nada:

1. No Google Cloud, no projeto dessa conta de serviço: *APIs e serviços ›
   Biblioteca › Google Play Developer Reporting API › Ativar*.
2. No Play Console: *Usuários e permissões › a conta de serviço › Permissões do
   app › FinançasPro › "Ver informações do app (somente leitura)"*.

Depois, rode o workflow à mão (*Actions › Android vitals › Run workflow*) para
conferir: o resumo da execução deve mostrar as duas taxas.
