# Smoke em aparelho — a cada release

O CI roda o app num Chromium de desktop. Ele não pega o que só existe no
aparelho: o recorte da câmera sobre o cabeçalho, o teclado cobrindo o botão de
salvar, a compra pela Play, o app aberto sem rede. Este roteiro cobre esses
pontos em 10–15 minutos. É **obrigatório antes de promover uma versão** do
teste interno para o fechado ou para produção
([`docs/build-aab-runbook.md`](../build-aab-runbook.md), passo 5).

## Aparelhos

Dois bastam, se forem diferentes entre si:

| | Por quê |
|---|---|
| **A.** Um com recorte (notch ou furo na tela) e navegação por gestos, Android recente | Status bar, área segura, barra de gestos sobre a navegação inferior |
| **B.** Um de tela pequena ou barato (≤ 6", até 4 GB de RAM), Android mais antigo que o app suporta | Teclado sobre o formulário, desempenho da abertura, layout apertado |

Instale **o mesmo AAB** que vai ser promovido, pela faixa de teste interno da
Play (não por `adb install` de um debug): é o caminho que o usuário vai
percorrer, com a assinatura e o faturamento de verdade.

## Roteiro

Marque cada item em cada aparelho. Um ✗ bloqueia a promoção até ser
corrigido ou explicado na issue da release.

### 1. Abertura e recorte da tela (A e B)

- [ ] Abre sem tela branca; o splash some sozinho.
- [ ] A status bar fica verde (`#12694E`, js/capacitor-init.js) com hora e
      bateria legíveis sobre ela, e o cabeçalho do app começa **abaixo** dela e
      do recorte (nada do título escondido).
- [ ] A navegação inferior fica acima da barra de gestos (dá para tocar em
      todas as abas sem abrir o menu do sistema).
- [ ] Girar o aparelho e voltar não quebra o layout.

### 2. Teclado no Novo lançamento (B primeiro)

- [ ] Aba **Novo** → tocar no valor: o teclado numérico abre e o campo fica
      visível acima dele.
- [ ] Tocar na descrição e digitar: o campo continua visível (a tela sobe,
      `adjustResize`), e o botão de salvar dá para alcançar rolando.
- [ ] Salvar uma despesa: o teclado fecha, aparece a confirmação e o valor
      entra no Resumo.

### 3. Paywall (A, com conta de teste da Play)

- [ ] No plano grátis, com uma meta já criada, tentar criar a segunda (Metas ou
      Simulador → "Criar meta no app"): abre o paywall com o motivo do limite.
- [ ] Os planos mostram o **preço da Play** em reais (não um valor fixo).
- [ ] O X e o botão **Voltar** do Android fecham o paywall sem sair do app.
- [ ] Com conta de testador de licença: assinar o Pro conclui e o plano muda
      no Perfil; "Restaurar compras" reconhece a assinatura depois de
      reinstalar.

### 4. Modo avião (A e B)

- [ ] Com dados no app, ativar o modo avião, fechar o app (tirar dos
      recentes) e abrir de novo: abre com os dados, sem erro.
- [ ] Com conta: o indicador de sincronização mostra "Offline — alterações
      pendentes".
- [ ] Lançar uma despesa offline: salva e aparece no Resumo.
- [ ] Desativar o modo avião (com conta): o indicador passa por
      "Sincronizando…" e chega a "Salvo no servidor", e o lançamento não
      duplica (conferir no Extrato).

### 5. Voltar e privacidade (A)

- [ ] Com um modal aberto (ex.: editar lançamento), **Voltar** fecha o modal;
      só na tela inicial o Voltar sai do app.
- [ ] Na tela de login ou do PIN, a lista de apps recentes e o print de tela
      mostram a tela em branco (`FLAG_SECURE`), não o conteúdo.

## Registro

Na issue da release (modelo **Release** em *New issue*), anote para cada
aparelho: modelo, versão do Android, versão do app (`versionName` /
`versionCode`) e o resultado de cada bloco. Falhas viram issue própria, com
print ou gravação de tela.
