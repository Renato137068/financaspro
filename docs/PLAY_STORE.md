# Publicação na Google Play Store

Este guia descreve como gerar o **AAB** (Android App Bundle) do FinançasPro a partir do projeto web + Capacitor.

## Pré-requisitos

1. [Node.js 18+](https://nodejs.org/)
2. [Android Studio](https://developer.android.com/studio) com SDK 34+
3. Conta [Google Play Console](https://play.google.com/console) (taxa única de desenvolvedor)
4. JDK 17 (incluído no Android Studio)

## 1. Ícones e splash

```bash
npm run icons:generate
npm run play-assets:generate   # feature graphic + mocks SVG (fallback)
npm run screenshots:capture    # capturas reais do app (requer playwright)
```

Gera PNGs em `icons/android/` e `icons/splash/` exigidos pelo manifest e pela Play Store.

### Screenshots reais (recomendado antes de publicar)

```bash
npm install -D playwright
npx playwright install chromium
npm run build
npm run screenshots:capture
```

Salva em `screenshots/` e `docs/play-store/` (1080×1920). Usa `?offline=1` para evitar overlay de login.

## 2. Build web

```bash
npm run build
```

O Capacitor usa a pasta `dist/` como `webDir`.

## 3. Projeto Android (primeira vez)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/splash-screen @capacitor/status-bar
npx cap add android
npx cap sync android
```

Isso cria/atualiza a pasta `android/`.

## 4. Abrir no Android Studio

```bash
npm run android:open
```

Ou: Android Studio → Open → `financaspro/android/`

## 5. Assinatura (release)

No Android Studio:

1. **Build → Generate Signed Bundle / APK**
2. Escolha **Android App Bundle**
3. Crie ou use um keystore (guarde a senha em local seguro)
4. Build variant: **release**

O `.aab` fica em `android/app/build/outputs/bundle/release/`.

## 6. Play Console — checklist

| Item | Valor sugerido |
|------|----------------|
| Nome | FinançasPro |
| Categoria | Finanças |
| Classificação | PEGI 3 / Livre (sem conteúdo sensível) |
| Política de privacidade | `https://SEU_DOMINIO/privacidade.html` (arquivo local: `privacidade.html`) |
| Ícone 512×512 | `icons/android/icon-512.png` |
| Feature graphic | 1024×500 (criar no Figma/Canva) |
| Screenshots | Mín. 2 por tipo de dispositivo (phone 1080×1920) |

## 7. Permissões

O app é **offline-first**. Permissões padrão do Capacitor WebView:

- `INTERNET` — API SaaS e fontes (se habilitadas)
- Sem câmera/localização por padrão (OCR usa input de arquivo)

Revise `android/app/src/main/AndroidManifest.xml` antes de publicar.

## 8. Comandos úteis

```bash
npm run android:sync    # build + cap copy/sync
npm run android:open    # Android Studio
npm run android:run     # dispositivo/emulador (requer SDK)
```

## 9. Experiência mobile no código

- `css/utilities/mobile-app.css` — safe areas, nav inferior, standalone
- `js/capacitor-init.js` — status bar verde, splash, botão voltar
- `manifest.json` — PWA instalável + ícones maskable
- `viewport-fit=cover` no `index.html`

## 10. Versionamento

Atualize antes de cada release:

- `package.json` → `"version"` (atual: **11.0.0**)
- `android/app/build.gradle` → `versionCode` (**11**) e `versionName` (**11.0.0**)
- Política de privacidade: `privacidade.html` (copiada para `dist/` no build)

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Tela branca no app | `npm run build && npx cap sync android` |
| Ícones quebrados | `npm run icons:generate` e sync de novo |
| CSP bloqueia API | Ajuste `connect-src` em `index.html` para domínio de produção |
| file:// no emulador | Use sempre build Capacitor (`https` scheme) |
