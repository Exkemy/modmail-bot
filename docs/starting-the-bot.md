# 🏃 Lancer le bot
Vous n'avez pas encore configuré le bot ? Consultez d'abord [Configurer le bot](setup.md) !

## Windows
* Pour démarrer le bot, double-cliquez sur `start.bat` dans le dossier du bot
* Pour arrêter le bot, fermez la fenêtre de console
* Pour redémarrer le bot, fermez la fenêtre de console puis double-cliquez à nouveau sur `start.bat`

## Linux / macOS / Utilisation avancée sur Windows
Les étapes suivantes supposent une connaissance de base des outils en ligne de commande.
1. Avant le premier lancement et après chaque mise à jour, exécutez `npm ci` dans le dossier du bot
2. Exécutez `npm start` dans le dossier du bot pour le lancer

## Gestionnaires de processus
Si vous utilisez un gestionnaire de processus comme PM2, la commande à exécuter est `npm start`.
Un fichier de configuration PM2, `modmailbot-pm2.json`, est inclus dans le dépôt.
