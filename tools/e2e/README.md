# Vérification de la démo en ligne

`live-demo.cjs` parcourt la démo déployée sur Vercel avec un vrai navigateur (Playwright/Chromium), dans le modèle
B2B (une entreprise fait livrer un destinataire qui n’a pas de compte) :

1. API (`/health`, `/config`) ;
2. console : refus du code 123456 pour un contrôleur, code d’accès démo accepté, carte en direct ;
3. entreprise **Le Verdoyant** : nouvelle livraison en 3 étapes (destination sur la carte, colis et prix, demande),
   puis écran de suivi avec le lien à envoyer au destinataire ;
4. destinataire : ouvre le lien `/suivi/<jeton>` **sans compte** (titre « Suivi de livraison · Yaar Livraison »,
   recherche d’un livreur, code de livraison, montant à payer) ;
5. livreur **Karim D.** : consentement GPS, en ligne, offre reçue par polling (entreprise + zone), acceptation,
   retrait, montant à encaisser, saisie du code lu sur la page de suivi → « Colis livré » sur la page de suivi,
   « Livrée » côté entreprise, course « Livrée » et caisse du livreur dans la console ; aucune requête Socket.IO ;
6. avertissement « démonstration publique » sur l’écran des pièces KYC d’un livreur.

Contrôles stricts :

- **montants exacts** : le montant que paiera le destinataire (récapitulatif de la demande) est comparé à l’identique
  au montant affiché sur sa page de suivi, aux espèces de l’offre reçue par le livreur et au montant qu’il encaisse ;
- **cartes** : marqueurs MapLibre du destinataire, puis de l’entreprise et du livreur présents sur la page de suivi ;
- **connexions de démonstration sans demande de code** (le code 123456 est accepté en mode démo) : le script peut être
  relancé plusieurs fois dans l’heure sans buter sur la limite de 5 codes par numéro.

```bash
E2E_STAFF_CODE=<code d'accès démo> node tools/e2e/live-demo.cjs
```

Adresses par défaut : `https://yaar-livraison.vercel.app`, `https://yaar-console.vercel.app`,
`https://yaar-api.vercel.app` (variables `APP_URL`, `CONSOLE_URL`, `API_URL`). Captures dans `./e2e-out`
(`E2E_OUT`). Le script crée et livre une livraison de test dans la base de démonstration, et remet le livreur de
démo Karim D. hors ligne à la fin. Ne pas lancer contre une base réelle.
