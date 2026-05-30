# @bandari/mobile (scaffold)

Expo / React Native app, **scaffolded now and built later**. It already imports
the shared, typed API client (`@bandari/shared`) — the same contract the web app
uses — so there are no rewrites when this is fleshed out.

## What's here

- `src/api.ts` — the shared `BandariClient`, ready to use today.
- `App.tsx` — a minimal screen listing payments (uses shared `PaymentView` + `STATUS_META`).
- `app.json` — Expo config.

## Finish setup (later)

Kept out of the workspace install to stay lightweight. When you're ready:

```bash
cd apps/mobile
# add the Expo runtime + RN + NativeWind (Tailwind parity with web)
pnpm add expo react react-native
pnpm add -D @types/react typescript
npx expo install expo-constants
npx expo start
```

Because the data layer and types come from `@bandari/shared`, building screens
is just UI work — the corridor logic, schemas, and client are already done.
