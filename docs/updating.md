# ✨ Mettre le bot à jour

**Avant toute mise à jour, sauvegardez toujours votre fichier `db/data.sqlite`.**

**⚠ Remarque concernant la mise à jour vers la v3.0.0 :** Si vous utilisez actuellement une version *très* ancienne du bot, antérieure à février 2018, vous devez d'abord passer à la v2.30.1 et exécuter le bot une fois avant de passer à la v3.0.0.

## Pour mettre le bot à jour, suivez ces étapes :

1. Arrêtez le bot
2. Sauvegardez votre fichier `db/data.sqlite`
    * Si vous utilisez une autre base de données prise en charge, effectuez la sauvegarde correspondante
3. Téléchargez la dernière version du bot sur https://github.com/Dragory/modmailbot/releases/latest
4. Remplacez les anciens fichiers par ceux de la nouvelle version
5. Lisez le [CHANGELOG](https://github.com/Dragory/modmailbot/blob/master/CHANGELOG.md) pour vérifier si des modifications de configuration sont nécessaires
    * Faites particulièrement attention aux changements concernant les versions de Node.js prises en charge !
    * Si vous mettez à jour depuis une version antérieure à la v3.0.0, pensez à activer l'intention **Server Members** sur la page du bot dans le Portail développeur Discord ([Image](https://raw.githubusercontent.com/Dragory/modmailbot/master/docs/server-members-intent-2.png))
6. Redémarrez le bot :
    * Si vous utilisez `start.bat`, relancez simplement le script
    * Si vous exécutez le bot via la ligne de commande, lancez d'abord `npm ci` puis redémarrez le bot

👉 En cas de problème, **[rejoignez le serveur d'assistance pour obtenir de l'aide !](https://discord.gg/vRuhG9R)**
