const Eris = require("eris");
const transliterate = require("transliteration");
const { getOrFetchChannel } = require("../utils");
const { Routes } = require("discord-api-types/v10");

module.exports = ({ bot, knex, config, commands }) => {
  if (! config.allowMove) return;

  commands.addInboxThreadCommand("move", "<category:string$>", async (msg, args, thread) => {
    const searchStr = args.category;
    const normalizedSearchStr = transliterate.slugify(searchStr);

    const channel = await getOrFetchChannel(bot, msg.channel.id);
    const categories = channel.guild.channels.filter(c => {
      // Filtre les catégories qui ne sont pas la catégorie parente actuelle du fil
      return (c instanceof Eris.CategoryChannel) && (c.id !== channel.parentID);
    });

    if (categories.length === 0) return;

    // Vérifie si le nom d'une catégorie contient une partie de la chaîne recherchée
    const containsRankings = categories.map(cat => {
      const normalizedCatName = transliterate.slugify(cat.name);

      let i = 0;
      do {
        if (! normalizedCatName.includes(normalizedSearchStr.slice(0, i + 1))) break;
        i++;
      } while (i < normalizedSearchStr.length);

      if (i > 0 && normalizedCatName.startsWith(normalizedSearchStr.slice(0, i))) {
        // Priorise légèrement les catégories qui commencent par la chaîne recherchée
        i += 0.5;
      }

      return [cat, i];
    });

    // Trie par correspondance la plus pertinente
    containsRankings.sort((a, b) => {
      return a[1] > b[1] ? -1 : 1;
    });

    if (containsRankings[0][1] === 0) {
      thread.postSystemMessage("Aucune catégorie correspondante");
      return;
    }

    const targetCategory = containsRankings[0][0];

    try {
      await bot.editChannel(thread.channel_id, {
        parentID: targetCategory.id
      });
    } catch (e) {
      thread.postSystemMessage(`Échec du déplacement du fil : ${e.message}`);
      return;
    }

    // Si activé, synchronise les permissions du salon du fil avec celles de la catégorie cible
    if (config.syncPermissionsOnMove) {
      const newPerms = Array.from(targetCategory.permissionOverwrites.map(ow => {
        return {
          id: ow.id,
          type: ow.type,
          allow: ow.allow,
          deny: ow.deny
        };
      }));

      try {
        await bot.requestHandler.request("PATCH", Routes.channel(thread.channel_id), true, {
          permission_overwrites: newPerms
        });
      } catch (e) {
        thread.postSystemMessage(`Fil déplacé vers ${targetCategory.name.toUpperCase()}, mais la synchronisation des permissions a échoué : ${e.message}`);
        return;
      }
    }

    thread.postSystemMessage(`Fil déplacé vers ${targetCategory.name.toUpperCase()}`);
  });
};
