const config = require("../cfg");
const threads = require("../data/threads");
const utils = require("../utils");

module.exports = ({ bot }) => {
  const leaveIgnoreIDs = [];

  // Notification d'arrivée : publie un message dans le fil si l'utilisateur rejoint un serveur principal
  if (config.notifyOnMainServerJoin) {
    bot.on("guildMemberAdd", async (guild, member) => {
      const mainGuilds = utils.getMainGuilds();
      if (! mainGuilds.find((gld) => gld.id === guild.id)) return;

      const thread = await threads.findOpenThreadByUserId(member.id);
      if (thread != null) {
        await thread.postSystemMessage(
          `***L'utilisateur a rejoint le serveur ${guild.name}.***`
        );
      }
    });
  }

  // Notification de départ : publie un message dans le fil si l'utilisateur quitte un serveur principal
  if (config.notifyOnMainServerLeave) {
    bot.on("guildMemberRemove", async (guild, member) => {
      const mainGuilds = utils.getMainGuilds();
      if (! mainGuilds.find((gld) => gld.id === guild.id)) return;

      // S'assure que les éventuels bannissements sont détectés avant l'envoi du message (condition de course)
      setTimeout(async () => {
        const thread = await threads.findOpenThreadByUserId(member.id);
        if (thread != null) {
          if (leaveIgnoreIDs.includes(member.id)) {
            leaveIgnoreIDs.splice(leaveIgnoreIDs.indexOf(member.id), 1);
          } else {
            await thread.postSystemMessage(
              `***L'utilisateur a quitté le serveur ${guild.name}.***`
            );
          }
        }
      }, 2 * 1000);
    });
  }

  // Notification de départ : publie un message dans le fil si l'utilisateur est banni d'un serveur principal
  if (config.notifyOnMainServerLeave) {
    bot.on("guildBanAdd", async (guild, user) => {
      const mainGuilds = utils.getMainGuilds();
      if (! mainGuilds.find((gld) => gld.id === guild.id)) return;

      const thread = await threads.findOpenThreadByUserId(user.id);
      if (thread != null) {
        await thread.postSystemMessage(
          `***L'utilisateur a été banni du serveur ${guild.name}.***`
        );
        leaveIgnoreIDs.push(user.id);
      }
    });
  }

  // Notification « arrivée » : publie un message dans le fil si l'utilisateur est débanni d'un serveur principal
  if (config.notifyOnMainServerJoin) {
    bot.on("guildBanRemove", async (guild, user) => {
      const mainGuilds = utils.getMainGuilds();
      if (! mainGuilds.find((gld) => gld.id === guild.id)) return;

      const thread = await threads.findOpenThreadByUserId(user.id);
      if (thread != null) {
        await thread.postSystemMessage(
          `***L'utilisateur a été débanni du serveur ${guild.name}.***`
        );
      }
    });
  }
};
