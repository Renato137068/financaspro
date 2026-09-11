# Gerar o AAB assinado e subir na Play Store (teste fechado)

> Rode no **PowerShell** ou **Git Bash**, dentro da pasta do projeto:
> `cd C:\Users\renat\Downloads\financaspro`
>
> O código já está pronto e commitado (`e124f42`). Estes passos produzem o
> arquivo `.aab` que você envia ao Play Console.

---

## Passo 1 — Criar a keystore de upload (só na primeira vez)

A keystore é a sua chave de assinatura. **Escolha uma senha forte e GUARDE em lugar
seguro** (gerenciador de senhas). Perder essa senha = perder o app na Play Store.

No terminal, na pasta do projeto:

```
keytool -genkeypair -v -keystore financaspro-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias financaspro
```

- Ele vai pedir uma senha (crie e anote), confirmar, e alguns dados (nome, org, país).
  Pode responder o essencial; no fim confirme com `sim`/`yes`.
- Isso cria o arquivo `financaspro-upload.jks` na pasta do projeto.
- **Nunca** faça commit desse arquivo (o `.gitignore` já protege `*.jks` e `keystore.properties`).

## Passo 2 — Apontar o build para a keystore

Crie o arquivo `android\keystore.properties` com este conteúdo (troque as senhas):

```
storeFile=../../financaspro-upload.jks
storePassword=SUA_SENHA_DA_KEYSTORE
keyAlias=financaspro
keyPassword=SUA_SENHA_DA_KEYSTORE
```

> Observação: `storeFile` é relativo a `android/app/`. Se preferir, use o caminho
> absoluto, ex.: `storeFile=C:\\Users\\renat\\Downloads\\financaspro\\financaspro-upload.jks`.

## Passo 3 — Build web + sync com o Android

```
npm run build
npx cap sync android
```

- `npm run build` gera o `dist/` (bundle único + CSP de produção sem localhost).
- Opcional: `SUPABASE_URL` + `SUPABASE_ANON_KEY` no ambiente → `inject-supabase-env.cjs` sobrescreve o projeto cloud (anon key continua pública).
- `npx cap sync android` copia o `dist/` para dentro do projeto Android.
- Após publicar o site, sirva `dist/.well-known/assetlinks.json` em
  `https://app.financaspro.com/.well-known/assetlinks.json` (App Links). Se usar
  Play App Signing, acrescente o SHA-256 do certificado da Play no JSON
  (`npm run` → `node scripts/print-android-sha256.cjs` para o de upload).

Atalho AAB: `npm run android:bundle` (cloud) ou `npm run android:bundle:local` (piloto offline).

## Passo 4 — Gerar o AAB assinado

```
cd android
.\gradlew bundleRelease
cd ..
```

(No Git Bash use `./gradlew bundleRelease`.)

- A primeira execução baixa o Gradle e pode levar alguns minutos.
- Ao final, o arquivo sai em:
  `android\app\build\outputs\bundle\release\app-release.aab`

Se der erro de JDK/SDK, confirme que o **Android Studio** está instalado e que o
`JAVA_HOME` aponta para o JDK do Android Studio (geralmente `...\Android\Android Studio\jbr`).

## Passo 5 — Subir no Play Console (teste fechado)

1. Play Console → seu app → **Teste** → **Teste fechado** → criar faixa.
2. **Criar versão** → enviar o `app-release.aab`.
3. Adicionar os e-mails dos testers (ou um Grupo do Google).
4. Preencher **Conteúdo do app** (obrigatório antes de publicar):
   - Política de privacidade: URL público do `privacidade.html` (hospede no seu
     GitHub Pages: `https://renato137068.github.io/privacidade.html`).
   - **Data safety**, classificação etária, público-alvo (18+), anúncios (não),
     recursos financeiros → use a folha pronta em `docs/play-store-data-safety.md`.
   - Ficha (título, descrições, categoria Finanças) → `docs/play-store-ficha.md`.
   - Ícone 512: `icons/icon-512.png` · Feature graphic e screenshots: `docs/play-store/`.
5. Revisar e **lançar para teste fechado**. Mandar o link de opt-in para os testers.

---

## Lembretes de segurança
- Faça **backup da keystore** (`financaspro-upload.jks`) e da senha. Sem ela você não
  consegue publicar atualizações do mesmo app.
- O AAB padrão (`npm run android:bundle`) é **cloud** (Supabase + login). Use a ficha
  e a política de privacidade alinhadas a sync na nuvem.
- Piloto **100% local** (sem login): `npm run android:bundle:local` — esvazia Supabase
  no build e restaura `cloud` depois. Avise os testers que os dados ficam só no aparelho.
- Dev rápido: `localStorage.setItem('fp-force-local','1')` + reload (sem rebuild).

## Checagem rápida antes de subir (opcional)
```
npm test           # deve passar
npm run security:xss   # deve dar "0 sinks sem escape"
```
