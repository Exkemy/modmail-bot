<div align="center">

# Modmail Bot

### Systeme de tickets par messages prives pour Discord

[![Discord](https://img.shields.io/badge/Discord-Bot-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

<img src="https://i.imgur.com/MJMGZer.png" alt="Modmail" width="120"/>

<br/>

Un bot Discord puissant et entierement configurable qui permet aux utilisateurs de contacter le staff via messages prives. Chaque conversation cree un **ticket** dedie dans un salon prive, offrant une experience de support fluide et organisee.

<br/>

[Installation](#-installation) · [Configuration](#-configuration-complete) · [Commandes](#-commandes) · [FAQ](#-faq)

</div>

---

## Comment ca marche ?

```
Utilisateur                         Bot                            Staff
    |                                |                               |
    |-- Envoie un MP au bot -------->|                               |
    |                                |-- Selection de langue ------->|
    |                                |-- Selection de raison ------->|
    |                                |                               |
    |                                |== Cree un salon ticket ======>|
    |                                |-- Embed d'info du ticket ---->|
    |                                |-- Transmet le message ------->|
    |                                |                               |
    |<-- Reponse du staff -----------|<-- Staff repond dans le salon |
    |                                |                               |
    |-- Nouveau message ------------>|-- Transmet au salon --------->|
    |                                |                               |
    |<-- Notification de fermeture --|<-- !close --------------------|
```

**En resume :** L'utilisateur envoie un MP au bot. Le bot le guide a travers un workflow configurable (langue, raison du ticket), puis cree un salon prive ou le staff peut repondre. Toute la conversation est relayee de maniere transparente.

---

## Fonctionnalites principales

| Fonctionnalite | Description |
|---|---|
| **Workflow configurable** | Menu de selection de langue et de raison entierement personnalisable via `config.ini` |
| **Traduction automatique** | Traduction en temps reel des messages via OpenAI (GPT-4o-mini) |
| **Multi-langues** | Support natif de 5+ langues (FR, EN, DE, ES, RU) avec ajout possible |
| **Embed d'information** | Embed riche a l'ouverture du ticket avec infos utilisateur (activable/desactivable) |
| **Routage par raison** | Categories, roles et mentions differents selon la raison du ticket |
| **Snippets** | Reponses rapides pre-enregistrees avec support inline `{{snippet}}` |
| **Blocage** | Systeme de blocage temporaire ou permanent avec messages personnalisables |
| **Alertes automatiques** | Notification apres un delai configurable sans reponse |
| **Logs** | Historique complet des conversations avec interface web |
| **Plugins** | Systeme de plugins extensible (plugins integres + externes) |
| **Pieces jointes** | Gestion des images et fichiers avec stockage Discord ou local |

---

## Pre-requis

- **Node.js** 18 ou superieur
- **npm** (inclus avec Node.js)
- Un **bot Discord** cree via le [Discord Developer Portal](https://discord.com/developers/applications)
- Les **intents** suivants actives : `GUILDS`, `GUILD_MEMBERS`, `GUILD_MESSAGES`, `DIRECT_MESSAGES`, `MESSAGE_CONTENT`

---

## Installation

### 1. Cloner le depot

```bash
git clone https://github.com/exkemy/modmail-bot.git
cd modmail-bot
```

### 2. Installer les dependances

```bash
npm install
```

### 3. Configurer le bot

```bash
cp config.example.ini config.ini
```

Editez `config.ini` avec vos valeurs (token, IDs serveur, etc.). Voir la [configuration complete](#-configuration-complete) ci-dessous.

### 4. Lancer le bot

```bash
npm start
```

### Mise a jour

```bash
git pull
npm install
```

> **Important :** Sauvegardez toujours votre fichier `db/data.sqlite` avant de mettre a jour.

---

## Workflow du ticket

Le parcours de l'utilisateur est **entierement configurable**. Voici les etapes possibles :

### Etape 1 : Selection de la langue *(optionnel)*

Si `enableLanguageSelection = on`, l'utilisateur choisit sa langue via un menu deroulant. Les langues disponibles sont definies dans `supportedLanguages[]`.

> Desactivez cette etape avec `enableLanguageSelection = off` si votre serveur est monolingue.

### Etape 2 : Selection de la raison *(optionnel)*

Si des `ticketReasonOptions[]` sont definies, l'utilisateur choisit la raison de son ticket via un menu deroulant. Chaque raison peut avoir ses propres roles autorises, mentions et categorie.

> Si aucune raison n'est definie, le ticket s'ouvre directement.

### Etape 3 : Creation du ticket

Le bot cree automatiquement un salon dans la categorie configuree, envoie un embed d'information (si `ticketEmbed = on`), et transmet les messages de l'utilisateur.

---

## Configuration complete

Le fichier `config.ini` controle **tout** le comportement du bot. Voici la reference complete de chaque option.

### Parametres requis

| Option | Description |
|---|---|
| `token` | Token du bot Discord |
| `mainServerId` | ID du serveur principal (ou les utilisateurs se trouvent) |
| `inboxServerId` | ID du serveur inbox (ou les tickets sont crees) |
| `logChannelId` | ID du salon pour les logs du bot |
| `openaiApiKey` | Cle API OpenAI pour la traduction automatique |

### Parametres generaux

| Option | Defaut | Description |
|---|---|---|
| `prefix` | `!` | Prefixe des commandes du bot |
| `snippetPrefix` | `!!` | Prefixe pour les snippets |
| `snippetPrefixAnon` | `!!!` | Prefixe pour les snippets anonymes |
| `status` | `Envoyez-moi un message...` | Statut affiche par le bot |
| `statusType` | `playing` | Type de statut : `playing`, `watching`, `listening`, `streaming` |
| `statusUrl` | | URL Twitch (requis si `statusType = streaming`) |
| `responseMessage` | `Merci pour votre message...` | Message envoye a l'utilisateur a l'ouverture du ticket |
| `closeMessage` | | Message envoye a l'utilisateur a la fermeture du ticket |
| `url` | | URL du webserver pour consulter les logs |
| `inboxServerPermission` | `manageMessages` | Permission requise pour acceder au serveur inbox |

### Workflow du ticket

| Option | Defaut | Description |
|---|---|---|
| `enableLanguageSelection` | `on` | Active/desactive le menu de selection de langue |
| `defaultLanguage` | `fr` | Langue par defaut si aucune n'est selectionnee |
| `supportedLanguages[]` | 5 langues | Langues disponibles (format JSON : `{"value": "fr", "label": "..."}`) |
| `ticketEmbed` | `on` | Active/desactive l'embed d'information a l'ouverture |
| `ticketEmbedTitle` | `Nouveau ticket` | Titre personnalise de l'embed |

#### Options du menu de raison

```ini
# Ajouter une option au menu
ticketReasonOptions[] = {"label": "Mon label", "value": "mon_identifiant"}
```

| Champ | Description |
|---|---|
| `label` | Texte affiche dans le menu deroulant (emojis supportes) |
| `value` | Identifiant unique de la raison (utilise en interne) |

#### Configuration par raison

Pour chaque `value` definie dans `ticketReasonOptions[]`, vous pouvez configurer :

```ini
# Restreindre la visibilite du ticket a ces roles
ticketReasons.mon_identifiant.allowedRoles[] = ID_DU_ROLE

# Roles a mentionner quand un ticket est ouvert avec cette raison
ticketReasons.mon_identifiant.mentionRole[] = ID_DU_ROLE

# Categorie Discord ou creer le salon du ticket
ticketReasons.mon_identifiant.categoryId = ID_DE_LA_CATEGORIE
```

### Messages personnalisables

Tous les messages affiches a l'utilisateur sont personnalisables :

| Option | Description |
|---|---|
| `languagePrompt` | Texte du prompt de selection de langue |
| `languagePlaceholder` | Placeholder du menu de langue |
| `ticketReasonPrompt` | Texte du prompt de selection de raison |
| `ticketReasonPlaceholder` | Placeholder du menu de raison |
| `ticketOpenedMessage` | Confirmation d'ouverture (`{reason}` = raison choisie) |
| `ticketOpenedMessageNoReason` | Confirmation d'ouverture sans raison |
| `ticketErrorMessage` | Message d'erreur a l'ouverture |

### Categories et organisation

| Option | Defaut | Description |
|---|---|---|
| `categoryAutomation.newThread` | | Categorie par defaut pour les nouveaux tickets |
| `categoryAutomation.newThreadFromReason.*` | | Categorie specifique par raison de ticket |
| `categoryAutomation.newThreadFromServer.*` | | Categorie specifique par serveur source |
| `allowMove` | `off` | Autoriser le deplacement de tickets (`!move`) |
| `syncPermissionsOnMove` | `on` | Synchroniser les permissions lors d'un deplacement |

### Mentions et notifications

| Option | Defaut | Description |
|---|---|---|
| `mentionRole[]` | `none` | Roles a mentionner a l'ouverture d'un ticket |
| `mentionUserInThreadHeader` | `off` | Mentionner l'utilisateur dans le header du fil |
| `pingOnBotMention` | `on` | Ping le staff quand le bot est mentionne sur le serveur |
| `botMentionResponse` | | Reponse automatique quand le bot est mentionne |
| `notifyOnMainServerJoin` | `on` | Notifier quand un membre rejoint le serveur |
| `notifyOnMainServerLeave` | `on` | Notifier quand un membre quitte le serveur |

### Affichage du header

| Option | Defaut | Description |
|---|---|---|
| `pinThreadHeader` | `off` | Epingler le header du fil |
| `rolesInThreadHeader` | `off` | Afficher les roles dans le header |
| `useNicknames` | `off` | Utiliser les pseudos serveur |
| `useDisplaynames` | `on` | Utiliser les noms d'affichage Discord |
| `anonymizeChannelName` | `off` | Anonymiser le nom du salon de ticket |
| `threadTimestamps` | `off` | Afficher les horodatages dans les messages |

### Reponses

| Option | Defaut | Description |
|---|---|---|
| `alwaysReply` | `off` | Repondre automatiquement sans commande |
| `alwaysReplyAnon` | `off` | Reponse automatique anonyme |
| `forceAnon` | `off` | Forcer le mode anonyme pour toutes les reponses |
| `showResponseMessageInThreadChannel` | `on` | Afficher le message automatique dans le salon staff |
| `relayInlineReplies` | `on` | Relayer les reponses inline (reply Discord) |
| `updateMessagesLive` | `off` | Mettre a jour les messages modifies/supprimes en temps reel |
| `breakFormattingForNames` | `on` | Echapper le formatage Markdown dans les noms |

### Snippets (reponses rapides)

| Option | Defaut | Description |
|---|---|---|
| `allowSnippets` | `on` | Activer les snippets |
| `allowInlineSnippets` | `on` | Activer les snippets inline `{{snippet}}` |
| `inlineSnippetStart` | `{{` | Delimiteur d'ouverture |
| `inlineSnippetEnd` | `}}` | Delimiteur de fermeture |
| `errorOnUnknownInlineSnippet` | `on` | Erreur si un snippet inline est inconnu |

### Blocage

| Option | Defaut | Description |
|---|---|---|
| `allowBlock` | `on` | Autoriser le blocage d'utilisateurs |
| `blockMessage` | | Message envoye a l'utilisateur bloque |
| `timedBlockMessage` | | Message pour blocage temporaire (`{duration}`, `{timestamp}`) |
| `blockedReply` | | Reponse si un utilisateur bloque envoie un message |
| `unblockMessage` | | Message envoye au deblocage |
| `timedUnblockMessage` | | Message au deblocage automatique |

### Moderation

| Option | Defaut | Description |
|---|---|---|
| `allowStaffEdit` | `on` | Autoriser la modification des reponses staff |
| `allowStaffDelete` | `on` | Autoriser la suppression des reponses staff |
| `allowSuspend` | `on` | Autoriser la mise en pause des tickets |
| `allowNotes` | `on` | Autoriser les notes sur les utilisateurs |

### Alertes et reactions

| Option | Defaut | Description |
|---|---|---|
| `autoAlert` | `off` | Alerte automatique apres un delai sans reponse |
| `autoAlertDelay` | `2m` | Delai avant alerte (format : `2m`, `1h30m`, etc.) |
| `reactOnSeen` | `off` | Ajouter une reaction quand un message est vu |
| `reactOnSeenEmoji` | `📨` | Emoji de la reaction |

### Restrictions d'acces

| Option | Defaut | Description |
|---|---|---|
| `requiredAccountAge` | | Age minimum du compte Discord (en heures) |
| `accountAgeDeniedMessage` | `Votre compte...` | Message si le compte est trop recent |
| `requiredTimeOnServer` | | Temps minimum sur le serveur (en minutes) |
| `timeOnServerDeniedMessage` | `Vous n'etes pas...` | Message si pas assez de temps sur le serveur |
| `ignoreAccidentalThreads` | `off` | Ignorer les messages accidentels ("ok", "thanks") |
| `createThreadOnMention` | `off` | Creer un ticket quand le bot est mentionne sur le serveur |

### Pieces jointes

| Option | Defaut | Description |
|---|---|---|
| `attachmentStorage` | `original` | Mode de stockage : `original`, `discord`, `local` |
| `attachmentStorageChannelId` | | ID du salon de stockage (requis si `discord`) |
| `relaySmallAttachmentsAsAttachments` | `off` | Envoyer les petits fichiers directement |
| `smallAttachmentLimit` | `2097152` | Taille max en octets (defaut : 2 Mo) |

### Roles d'affichage

| Option | Defaut | Description |
|---|---|---|
| `allowChangingDisplayRole` | `on` | Autoriser le changement de role affiche |
| `fallbackRoleName` | | Nom de role par defaut |
| `overrideRoleNameDisplay` | | Forcer un nom de role pour toutes les reponses |

### Proxy de frappe

| Option | Defaut | Description |
|---|---|---|
| `typingProxy` | `off` | Relayer l'indicateur de frappe utilisateur vers staff |
| `typingProxyReverse` | `off` | Relayer l'indicateur de frappe staff vers utilisateur |

### Autres

| Option | Defaut | Description |
|---|---|---|
| `useGitForGitHubPlugins` | `off` | Utiliser git pour telecharger les plugins GitHub |
| `updateNotifications` | `on` | Notifications de mises a jour disponibles |
| `enableGreeting` | `off` | Activer le message de bienvenue |
| `greetingMessage` | | Message de bienvenue |
| `logStorage` | `local` | Type de stockage des logs |
| `port` | `5555` | Port du webserver |
| `dbType` | `sqlite` | Type de base de donnees (`sqlite`, `mysql`) |

### Alias de commandes

Vous pouvez creer des raccourcis pour n'importe quelle commande :

```ini
commandAliases.mv = move
commandAliases.x = close
commandAliases.n = newthread
```

---

## Commandes

### Commandes dans un ticket

| Commande | Description |
|---|---|
| `!reply <message>` | Repondre a l'utilisateur |
| `!anonreply <message>` | Repondre anonymement |
| `!close` | Fermer le ticket |
| `!close <delai>` | Fermer apres un delai (ex: `!close 1h`) |
| `!close -s` | Fermer silencieusement (sans notifier l'utilisateur) |
| `!logs` | Afficher l'historique des tickets de l'utilisateur |
| `!move <categorie>` | Deplacer le ticket vers une autre categorie |
| `!suspend` | Mettre le ticket en pause |
| `!unsuspend` | Reprendre le ticket |
| `!alert` | Etre notifie au prochain message de l'utilisateur |
| `!id` | Afficher l'ID de l'utilisateur |
| `!notes` | Afficher les notes sur l'utilisateur |
| `!notes add <texte>` | Ajouter une note |
| `!notes del <numero>` | Supprimer une note |
| `!edit <numero> <texte>` | Modifier une reponse staff |
| `!delete <numero>` | Supprimer une reponse staff |

### Commandes globales

| Commande | Description |
|---|---|
| `!newthread <user>` | Ouvrir un ticket avec un utilisateur |
| `!block <user>` | Bloquer un utilisateur |
| `!block <user> <duree>` | Bloquer temporairement (ex: `!block @user 7d`) |
| `!unblock <user>` | Debloquer un utilisateur |
| `!is_blocked <user>` | Verifier si un utilisateur est bloque |
| `!snippets` | Lister les snippets disponibles |
| `!snippet <nom>` | Voir le contenu d'un snippet |
| `!snippet add <nom> <contenu>` | Creer un snippet |
| `!snippet del <nom>` | Supprimer un snippet |
| `!version` | Afficher la version du bot |

### Commandes utilisateur (en MP)

| Commande | Description |
|---|---|
| `!lang <code>` | Changer la langue du ticket (ex: `!lang en`) |

---

## Traduction automatique

Le bot integre un systeme de traduction automatique via **OpenAI GPT-4o-mini**.

**Comment ca marche :**
- Quand un utilisateur ecrit dans une langue differente du francais, son message est automatiquement traduit pour le staff
- Quand le staff repond, le message est automatiquement traduit dans la langue de l'utilisateur
- Les deux versions (originale + traduction) sont affichees avec des drapeaux

**Configuration :**

```ini
openaiApiKey = sk-proj-votre-cle-api
```

> La traduction necessite une cle API OpenAI. Sans cle, les messages sont transmis sans traduction.

---

## Plugins

Le bot supporte un systeme de plugins pour etendre ses fonctionnalites.

### Plugins integres

Les plugins suivants sont inclus par defaut : `reply`, `close`, `logs`, `block`, `move`, `snippets`, `suspend`, `greeting`, `webserverPlugin`, `typingProxy`, `version`, `newthread`, `id`, `alert`, `joinLeaveNotification`, `roles`, `notes`.

### Plugins externes

Ajoutez des plugins externes via `config.ini` :

```ini
plugins[] = npm:modmail-plugin-example
plugins[] = https://github.com/user/plugin-repo
```

---

## Structure du projet

```
modmail-bot/
├── config.ini              # Configuration principale
├── config.example.ini      # Exemple de configuration
├── db/
│   └── data.sqlite         # Base de donnees
├── src/
│   ├── main.js             # Point d'entree et workflow
│   ├── cfg.js              # Chargement de la configuration
│   ├── bot.js              # Instance du bot Eris
│   ├── translation.js      # Traduction automatique
│   ├── data/
│   │   ├── Thread.js       # Classe Thread (ticket)
│   │   ├── threads.js      # Gestion des threads
│   │   ├── userProfiles.js # Profils utilisateur
│   │   └── cfg.schema.json # Schema de validation
│   └── modules/            # Plugins integres
└── docs/                   # Documentation
```

---

## FAQ

<details>
<summary><b>Comment ajouter une nouvelle langue au menu ?</b></summary>

Ajoutez une nouvelle ligne dans `config.ini` :

```ini
supportedLanguages[] = {"value": "pt", "label": "🇧🇷 Portugais"}
```

</details>

<details>
<summary><b>Comment desactiver le menu de raison ?</b></summary>

Supprimez ou commentez toutes les lignes `ticketReasonOptions[]` de votre `config.ini`. Les tickets s'ouvriront directement sans etape de selection.

</details>

<details>
<summary><b>Comment desactiver l'embed a l'ouverture ?</b></summary>

```ini
ticketEmbed = off
```

</details>

<details>
<summary><b>Comment utiliser une seule langue sans menu ?</b></summary>

```ini
enableLanguageSelection = off
defaultLanguage = fr
```

</details>

<details>
<summary><b>Comment ajouter une nouvelle raison de ticket ?</b></summary>

1. Ajoutez l'option dans le menu :
```ini
ticketReasonOptions[] = {"label": "🔧 Ma nouvelle raison", "value": "ma_raison"}
```

2. Configurez les roles et mentions (optionnel) :
```ini
ticketReasons.ma_raison.allowedRoles[] = ID_DU_ROLE
ticketReasons.ma_raison.mentionRole[] = ID_DU_ROLE
ticketReasons.ma_raison.categoryId = ID_CATEGORIE
```

</details>

<details>
<summary><b>Les apostrophes posent probleme dans config.ini ?</b></summary>

Oui, le parser INI interprete `'` comme un delimiteur. Evitez les apostrophes dans les valeurs, ou reformulez (ex: `l'ouverture` → `louverture`).

</details>

<details>
<summary><b>Comment sauvegarder ma base de donnees ?</b></summary>

Copiez simplement le fichier `db/data.sqlite`. Ce fichier contient tous les tickets, messages, profils et notes.

</details>

---

## Credits

Ce projet est un fork francais et amelioré de [Dragory/modmailbot](https://github.com/dragory/modmailbot).

- **Projet original :** [Dragory/modmailbot](https://github.com/dragory/modmailbot)
- **Inspire par :** Le systeme modmail
- **Licence :** MIT

---

<div align="center">

**[Remonter en haut](#modmail-bot)**

</div>
