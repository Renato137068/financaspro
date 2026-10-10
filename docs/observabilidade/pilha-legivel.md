# Ler a pilha de um erro relatado

O relatório de erro (painel de saúde, issue aberta pelo `saude.yml`) traz a
pilha do código minificado, por exemplo `app.bundle.js:1:48213`. Para saber
qual função quebrou:

1. Abra a execução do workflow **Release** da versão do erro (o relatório traz a
   versão) e baixe o artefato `sourcemaps-vX.Y.Z`. Ele fica guardado por 90 dias.
2. Descompacte numa pasta, por exemplo `sourcemaps/` na raiz do repositório
   (ela está no `.gitignore`).
3. Cole a pilha num arquivo e rode:

   ```
   npm run erro:pilha -- --mapas sourcemaps pilha.txt
   ```

   Cada `bundle.js:linha:coluna` vira `js/arquivo.js:linha:coluna [função]`.

Os mapas existem só no build do release (`FP_SOURCEMAPS=1`). O passo
`scripts/sourcemaps-guardar.cjs` do build os tira do `dist/` antes do sync com o
Android, então eles não vão no AAB nem no site, e o código minificado sai
idêntico ao de um build sem mapas.

Mapas de outra versão dão linhas erradas: use sempre o artefato da mesma tag.
