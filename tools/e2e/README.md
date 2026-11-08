# Vérification de la démo en ligne

`live-demo.cjs` parcourt la démo déployée sur Vercel avec un vrai navigateur (Playwright/Chromium) :
API (`/health`, `/config`), console (refus du code 123456 pour un contrôleur, code d'accès démo accepté,
carte en direct), puis une commande complète client → vendeur → livreur → livraison avec le code, la course
« Livrée » et la caisse dans la console, et l'avertissement « démonstration publique » des pièces KYC.

```bash
E2E_STAFF_CODE=<code d'accès démo> node tools/e2e/live-demo.cjs
```

Adresses par défaut : `https://yaar-livraison.vercel.app`, `https://yaar-console.vercel.app`,
`https://yaar-api.vercel.app` (variables `APP_URL`, `CONSOLE_URL`, `API_URL`). Captures dans `./e2e-out`
(`E2E_OUT`). Le script crée et livre une commande de test dans la base de démonstration, et remet le
livreur de démo Karim D. hors ligne à la fin. Ne pas lancer contre une base réelle.
