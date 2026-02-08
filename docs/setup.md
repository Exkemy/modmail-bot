# 🛠️ Configuration du bot
**Remarque :** Ce bot fonctionne sur votre propre machine ou sur un serveur.
Pour le maintenir en ligne, vous devez laisser le processus du bot actif.

## Terminologie
* Le **serveur principal** (ou *main guild*) est le serveur depuis lequel les utilisateurs contacteront modmail
* Le **serveur de réception** (ou *inbox guild*, ou serveur courrier) est le serveur sur lequel les fils modmail sont créés.
  Dans une « configuration mono-serveur », il s'agit du même serveur que le serveur principal.
* Un **fil modmail** est un salon sur le **serveur de réception** qui contient l'échange en cours avec l'**utilisateur**.
  Ces fils peuvent être fermés afin de les archiver. Un seul **utilisateur** ne peut avoir qu'un fil modmail ouvert à la fois.
* Un **modérateur**, dans le contexte de modmail, est un membre du staff du serveur qui répond et gère les fils modmail
* Un **utilisateur**, dans le contexte de modmail, est un utilisateur Discord qui contacte modmail en envoyant un message privé au bot

<a name="prerequis"></a>
## Prérequis
1. Créez un bot sur le [Portail développeur Discord](https://discord.com/developers/)
2. Activez les intentions **Server Members Intent** et **Message Content Intent** sur la page de configuration du bot dans le portail développeur ([Image](intents.png))
3. Installez Node.js 18 (LTS) ou une version ultérieure
4. [Téléchargez la dernière version du bot ici](https://github.com/Dragory/modmailbot/releases/latest) (cliquez sur « Source code (zip) »)
5. Extrayez l'archive Zip téléchargée dans un nouveau dossier
6. Dans le dossier du bot (celui extrait du fichier zip), faites une copie du fichier `config.example.ini` et renommez-la `config.ini`
    * Sous Windows, le fichier peut s'appeler `config.example` (sans `.ini` à la fin)

## Configuration mono-serveur
Dans cette configuration, les fils modmail sont ouverts sur le serveur principal dans une catégorie dédiée.
Cette configuration est recommandée pour les serveurs de petite et moyenne taille.

1. **Commencez par suivre les [prérequis](#prerequis) ci-dessus !**
2. Ouvrez `config.ini` dans un éditeur de texte et renseignez les valeurs requises. `mainServerId` et `inboxServerId` doivent tous deux correspondre à l'identifiant de votre serveur.
3. Invitez le bot sur le serveur
4. Sur une nouvelle ligne à la fin de `config.ini`, ajoutez `categoryAutomation.newThread = CATEGORY_ID_HERE`
    * Remplacez `CATEGORY_ID_HERE` par l'identifiant de la catégorie où les nouveaux fils modmail doivent être créés
5. Assurez-vous que le bot dispose des permissions `Manage Channels`, `Manage Messages` et `Attach Files` dans cette catégorie
    * Il est déconseillé de donner au bot les permissions Administrateur, quelles que soient les circonstances
6. **[🏃 Lancez le bot !](starting-the-bot.md)**
7. Vous souhaitez modifier d'autres options ? Consultez **[📝 Configuration](configuration.md)**
8. D'autres questions ? Consultez la **[🙋 Foire aux questions](faq.md)** ou
   **[rejoignez le serveur d'assistance !](../README.md#serveur-dassistance)**

## Configuration bi-serveur
Dans cette configuration, les fils modmail sont ouverts sur un serveur de réception distinct.
C'est la configuration recommandée pour les grands serveurs recevant beaucoup de modmails, où une configuration mono-serveur deviendrait difficile à gérer.
Vous pouvez également préférer cette configuration pour des raisons de confidentialité*.

1. **Commencez par suivre les [prérequis](#prerequis) ci-dessus !**
2. Créez un serveur de réception sur Discord
3. Ouvrez `config.ini` dans un éditeur de texte et renseignez les valeurs requises
    * Affectez à `mainServerId` l'identifiant du serveur **principal** depuis lequel les utilisateurs écriront au bot
    * Affectez à `inboxServerId` l'identifiant du serveur **de réception** créé à l'étape 2
4. Invitez le bot à la fois sur le serveur principal et sur le serveur de réception nouvellement créé
5. Ouvrez `config.ini` dans un éditeur de texte et complétez les valeurs
6. Assurez-vous que le bot dispose des permissions `Manage Channels`, `Manage Messages` et `Attach Files` sur le serveur **de réception**
    * Le bot n'a besoin d'aucune permission sur le serveur principal
7. **[🏃 Lancez le bot !](starting-the-bot.md)**
8. Vous souhaitez modifier d'autres options ? Consultez **[📝 Configuration](configuration.md)**
9. D'autres questions ? Consultez la **[🙋 Foire aux questions](faq.md)** ou
   **[rejoignez le serveur d'assistance !](../README.md#serveur-dassistance)**

*\* Puisque tous les noms de salons, même ceux auxquels vous n'avez pas accès, sont des informations publiques via l'API, un utilisateur disposant
d'un client modifié pourrait voir les noms de toutes les personnes contactant modmail en observant les noms des salons modmail.*
