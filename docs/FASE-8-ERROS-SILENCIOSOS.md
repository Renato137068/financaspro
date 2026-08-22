# Fase 8 — Fim das falhas silenciosas · concluída

**Resultado:** 1.168 testes frontend (+16) e 346 backend passando. Lint sem
erros. **Zero `catch` de corpo vazio** no projeto. Cobertura, contraste WCAG AA,
sinks de XSS e dívida de CSS sem regressão.

---

## O tema que atravessou toda a auditoria

Âncoras de DOM que faltavam. Recorrentes que não recorriam. Features fora do
bundle. Em todos os casos o código "funcionava" — só não fazia nada, e ninguém
era avisado.

Esta fase fecha a última frente disso.

---

## 1. `UTILS.tentar` — o substituto do catch vazio

Um `catch (e) {}` é a forma mais barata de fazer um bug desaparecer da vista sem
desaparecer do app. Quando algo quebra na casa do usuário, não sobra rastro
nenhum para investigar.

`UTILS.tentar(contexto, fn, opts)` faz três coisas que um catch vazio não faz:

1. **Registra no OBS com um contexto nomeado** — é o que transforma um stack
   anônimo em algo investigável.
2. **Devolve `{ ok, valor, erro }`** — quem chamou descobre que falhou, em vez de
   receber `undefined` e seguir como se tivesse dado certo.
3. **Avisa o usuário quando — e só quando — o erro é assunto dele.**

A mensagem exibida é sempre a que o chamador escreveu, nunca a técnica.
*"Cannot read properties of undefined"* não ajuda ninguém e ainda expõe detalhe
interno. Há teste travando isso.

### Os 20 catches, classificados

| Onde | Quantos | Tratamento |
|---|---:|---|
| `micro-interactions` (efeitos visuais) | 10 | Registra, **não avisa** — animação ausente não é assunto do usuário, e um toast de erro por animação seria pior que a falha |
| `init-navigation` (init de chunk lazy) | 6 | Registra — sem isso, "a aba de configurações não mostra o plano" vira relato sem pista |
| `onboarding` | 7 | Registra; **um deles avisa** (abaixo) |
| `insights`, `app-bootstrap` | 2 | Registra com valor padrão |

Seis dos vinte eram meus, das fases 6 e 7. Aparecem aqui como qualquer outro.

### O único que ganhou aviso ao usuário

No tour de onboarding, a gravação da **renda que a pessoa acabou de digitar**.
Perdê-la em silêncio significa que ela segue o tour inteiro achando que
informou, e o orçamento 50/30/20 nasce sem base nenhuma.

---

## 2. O pior caso: leitura corrompida parecendo "sem dados"

`getTransacoes()` devolvia `[]` quando o JSON do localStorage estava corrompido.

O efeito na tela é devastador **e ambíguo**: o usuário abre o app e vê zero
lançamentos. Ele não tem como saber se os dados sumiram ou se apenas não foram
lidos — e a diferença é enorme, porque no segundo caso **os dados ainda estão no
disco** e um backup pode salvá-los.

Pior: a primeira gravação seguinte sobrescreve o conteúdo corrompido, e aí a
perda vira definitiva.

Agora as três leituras (`transacoes`, `config`, `contas`) registram a falha e
avisam **uma vez por sessão**, com a instrução que efetivamente salva os dados:

> Não foi possível ler seus dados salvos. Eles podem estar íntegros — exporte um
> backup antes de registrar qualquer lançamento novo.

`DADOS.leituraFalhou()` expõe o estado para a UI. Também passou a tratar
"conteúdo com formato inesperado" como corrupção: um array que virou objeto é
tão sintoma quanto um JSON inválido, e tratá-lo como "vazio" esconderia o mesmo
problema.

---

## 3. O guarda

`tests/erros-silenciosos.test.js` varre todo o `js/` e falha se **qualquer**
`catch` de corpo vazio aparecer. Sem allowlist.

A tese: se o erro é mesmo irrelevante, dizer isso num comentário custa uma
linha — e a próxima pessoa saberá que foi decisão, não descuido.

> O guarda pegou o meu próprio comentário: a documentação de `UTILS.tentar`
> citava literalmente o padrão que ela substitui. Em vez de enfraquecer a regra
> para acomodar prosa, reescrevi o comentário. Um guarda que abre exceção para
> comentário abre exceção para código disfarçado de comentário.

---

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/core/utils.js` | **`UTILS.tentar`** |
| `js/core/dados.js` | `_registrarFalhaLeitura`, `leituraFalhou` nas três leituras |
| `js/micro-interactions.js` | 10 setups isolados com rastro |
| `js/onboarding.js` | 7 pontos; renda avisa o usuário |
| `js/modules/init-navigation.js` | 6 pontos |
| `js/insights.js`, `js/app-bootstrap.js` | 2 pontos |
| `tests/erros-silenciosos.test.js` | **novo** — 16 testes + guarda |
| `tests/lazy-chunks.test.js` | teste ajustado para medir intenção, não sintaxe |

---

## Estado do roadmap

| Item | Situação |
|---|---|
| Integridade financeira | ✅ Fases 1 e 4 |
| Funcionalidades inacessíveis | ✅ Fase 2 |
| Dashboard e as 8 perguntas | ✅ Fase 3 |
| Cartão de crédito | ✅ Fases 5 e 6 |
| Offline-first | ✅ Fase 7 |
| **Falhas silenciosas** | ✅ **esta fase** |
| CSS de 240 KB | ⬜ maior ganho técnico restante |
| Estado duplicado STORE/DADOS | ⬜ 29 usos fora do `actions.js` |
| Dois modelos de conta (nome × id) | ⬜ |
| Fronteira grátis/pago | ⬜ **decisão de produto, não técnica** |
| Assinaturas no comprometido | ⬜ |

---

## Uma observação sobre o que sobrou

Os itens restantes mudaram de natureza. Os oito primeiros eram **defeitos** —
coisas que davam resposta errada ou não davam resposta nenhuma. O que sobra é
outra categoria:

- **CSS de 240 KB** e **estado duplicado** são dívida técnica: o app funciona,
  só custa mais caro de carregar e de manter.
- **Fronteira grátis/pago** é decisão de produto. Nenhum teste vai dizer qual é
  a resposta certa, e implementar uma escolha errada é pior que não implementar.
- **Dois modelos de conta** só vale unificar junto de uma feature que precise
  disso — migrar por elegância é risco sem retorno.

Vale dizer isso porque a próxima rodada de trabalho tem um retorno bem menor por
hora investida do que as anteriores. As oito fases corrigiram coisas que
custavam dinheiro e confiança do usuário; daqui em diante o trabalho é
manutenção e escolha de rumo.

Minha sugestão, se for para continuar: **um teste E2E do caminho do dinheiro**
(lançar → dashboard → orçamento → editar → excluir). É o único item pendente que
ainda protege contra regressão de comportamento, e a suíte atual, apesar dos
1.168 testes, não exercita o fluxo completo numa página real.
