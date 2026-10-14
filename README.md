# Kyce Bot

Bot Discord pour l'agence Kyce.

## Déploiement sur Railway

1. Crée un nouveau projet sur [railway.app](https://railway.app)
2. Connecte ton repo GitHub (ou déploie depuis le code)
3. Ajoute les variables d'environnement :
   - `DISCORD_TOKEN` = ton token de bot
   - `CLIENT_ID` = l'Application ID (sur le Developer Portal)
4. Railway lance automatiquement `npm start`

## Enregistrer les commandes slash

Après le premier déploiement, lance une fois :
```
node deploy-commands.js
```

Ou dans Railway : Settings > Run Command > `node deploy-commands.js && node index.js`

## Commandes

- `/send message: salon:` — Envoie un message dans le salon choisi
