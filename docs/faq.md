# 🙋 Foire aux questions

## Que signifient les nombres devant les réponses du staff dans les fils modmail ?
Chaque réponse du staff reçoit un numéro interne. Ce numéro peut être utilisé avec
`!edit`, `!delete`, `!message` et potentiellement d'autres commandes à l'avenir.

## Dans une [configuration mono-serveur](setup.md#configuration-mono-serveur), comment puis-je cacher les modmails aux utilisateurs ordinaires ?
1. Créez une catégorie privée pour les fils modmail que seuls votre staff et le bot peuvent voir, puis définissez l'option
`categoryAutomation.newThread = 1234` (remplacez `1234` par l'identifiant de la catégorie)
2. Définissez l'option `inboxServerPermission` pour restreindre l'accès aux commandes du bot.
   [Cliquez ici pour plus d'informations.](configuration.md#inboxserverpermission)

## Mes journaux ne se chargent pas !
Comme les journaux sont stockés et envoyés directement depuis la machine qui exécute le bot, assurez-vous
que cette machine ne possède pas de pare-feu bloquant le bot et que les redirections de ports nécessaires sont en place.
[Vous trouverez ici plus d'informations et d'instructions pour configurer la redirection de ports.](https://portforward.com/)
Par défaut, le bot utilise le port **5555**.


## Je veux classer mes fils modmail dans plusieurs catégories
Activez `allowMove = on` pour permettre à votre staff de déplacer les fils vers d'autres catégories avec `!move`
