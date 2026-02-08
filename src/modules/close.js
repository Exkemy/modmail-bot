const moment = require("moment");
const Eris = require("eris");
const utils = require("../utils");
const threads = require("../data/threads");
const blocked = require("../data/blocked");
const { messageQueue } = require("../queue");
const { getLogUrl, getLogFile, getLogCustomResponse } = require("../data/logs");
const {THREAD_MESSAGE_TYPE} = require("../data/constants");

module.exports = ({ bot, knex, config, commands }) => {
  async function getMessagesAmounts(thread) {
    const messages = await thread.getThreadMessages();
    const chatMessages = [];
    const toUserMessages = [];
    const fromUserMessages = [];

    messages.forEach(message => {
      switch (message.message_type) {
        case THREAD_MESSAGE_TYPE.CHAT:
          chatMessages.push(message);
          break;

        case THREAD_MESSAGE_TYPE.TO_USER:
          toUserMessages.push(message);
          break;

        case THREAD_MESSAGE_TYPE.FROM_USER:
          fromUserMessages.push(message);
          break;
      }
    });

    return [
      `**${fromUserMessages.length}** message${fromUserMessages.length !== 1 ? "s" : ""} de l'utilisateur`,
      `, **${toUserMessages.length}** message${toUserMessages.length !== 1 ? "s" : ""} vers l'utilisateur`,
      ` et **${chatMessages.length}** message${chatMessages.length !== 1 ? "s" : ""} de discussion interne.`,
    ].join("");
  }

  async function sendCloseNotification(thread, body) {
    const logCustomResponse = await getLogCustomResponse(thread);
    if (logCustomResponse) {
      await utils.postLog(body);
      await utils.postLog(logCustomResponse.content, logCustomResponse.file);
      return;
    }

    body = `${body}\n${await getMessagesAmounts(thread)}`;

    const logUrl = await getLogUrl(thread);
    if (logUrl) {
      utils.postLog(utils.trimAll(`
          ${body}
          Journaux : ${logUrl}
        `));
      return;
    }

    const logFile = await getLogFile(thread);
    if (logFile) {
      utils.postLog(body, logFile);
      return;
    }

    utils.postLog(body);
  }

  // Vérifie les fils dont la fermeture est planifiée et les ferme
  async function applyScheduledCloses() {
    const threadsToBeClosed = await threads.getThreadsThatShouldBeClosed();
    for (const thread of threadsToBeClosed) {
      if (config.closeMessage && ! thread.scheduled_close_silent) {
        const closeMessage = utils.readMultilineConfigValue(config.closeMessage);
        await thread.sendSystemMessageToUser(closeMessage).catch(() => {});
      }

      await thread.close(false, thread.scheduled_close_silent);

      await sendCloseNotification(thread, `Le fil Modmail n°${thread.thread_number} avec ${thread.user_name} (${thread.user_id}) a été fermé comme prévu par ${thread.scheduled_close_name}`);
    }
  }

  async function scheduledCloseLoop() {
    try {
      await applyScheduledCloses();
    } catch (e) {
      console.error(e);
    }

    setTimeout(scheduledCloseLoop, 2000);
  }

  scheduledCloseLoop();

  // Ferme un fil. La fermeture enregistre un journal du contenu du salon puis supprime ce salon.
  commands.addGlobalCommand("close", "[opts...]", async (msg, args) => {
    let thread, closedBy;

    let hasCloseMessage = !! config.closeMessage;
    let silentClose = false;
    let suppressSystemMessages = false;

    if (msg.channel instanceof Eris.PrivateChannel) {
      // L'utilisateur ferme lui-même le fil (si autorisé)
      if (! config.allowUserClose) return;
      if (await blocked.isBlocked(msg.author.id)) return;

      thread = await threads.findOpenThreadByUserId(msg.author.id);
      if (! thread) return;

      // Nous devons ajouter cette opération à la file de messages afin d'éviter une condition de course
      // entre l'affichage de la commande de fermeture dans le fil et la fermeture effective du fil
      await messageQueue.add(async () => {
        thread.postSystemMessage("Fil fermé par l'utilisateur, fermeture en cours...");
        suppressSystemMessages = true;
      });

      closedBy = "l'utilisateur";
    } else {
      // Un membre de l'équipe ferme le fil
      if (! await utils.messageIsOnInboxServer(bot, msg)) return;
      if (! utils.isStaff(msg.member)) return;

      thread = await threads.findOpenThreadByChannelId(msg.channel.id);
      if (! thread) return;

      const opts = args.opts || [];

      if (args.cancel || opts.includes("cancel") || opts.includes("c")) {
        // Annule la fermeture programmée
        if (thread.scheduled_close_at) {
          await thread.cancelScheduledClose();
          thread.postSystemMessage("Fermeture planifiée annulée");
        }

        return;
      }

      // Fermeture silencieuse (= pas de message de fermeture)
      if (args.silent || opts.includes("silent") || opts.includes("s")) {
        silentClose = true;
      }

      // Fermeture programmée
      const delayStringArg = opts.find(arg => utils.delayStringRegex.test(arg));
      if (delayStringArg) {
        const delay = utils.convertDelayStringToMS(delayStringArg);
        if (delay === 0 || delay === null) {
          thread.postSystemMessage("Délai invalide spécifié. Format : \"1h30m\"");
          return;
        }

        const closeAt = moment.utc().add(delay, "ms");
        await thread.scheduleClose(closeAt.format("YYYY-MM-DD HH:mm:ss"), msg.author, silentClose ? 1 : 0);

        let response;
        if (silentClose) {
          response = `Le fil est désormais planifié pour être fermé silencieusement dans ${utils.humanizeDelay(delay)}. Utilisez \`${config.prefix}close cancel\` pour annuler.`;
        } else {
          response = `Le fil est désormais planifié pour être fermé dans ${utils.humanizeDelay(delay)}. Utilisez \`${config.prefix}close cancel\` pour annuler.`;
        }

        thread.postSystemMessage(response);

        return;
      }

      // Fermeture normale
      closedBy = config.useDisplaynames ? msg.author.globalName || msg.author.username : msg.author.username;
    }

    // Envoie le message de fermeture (sauf en cas de fermeture silencieuse)
    if (hasCloseMessage && ! silentClose) {
      const closeMessage = utils.readMultilineConfigValue(config.closeMessage);
      await thread.sendSystemMessageToUser(closeMessage).catch(() => {});
    }

    await thread.close(suppressSystemMessages, silentClose);

    await sendCloseNotification(thread, `Le fil Modmail n°${thread.thread_number} avec ${thread.user_name} (${thread.user_id}) a été fermé par ${closedBy}`);
  }, {
    options: [
      { name: "silent", shortcut: "s", isSwitch: true },
      { name: "cancel", shortcut: "c", isSwitch: true },
    ],
  });

  // Ferme automatiquement les fils si leur salon est supprimé
  bot.on("channelDelete", async (channel) => {
    if (! (channel instanceof Eris.TextChannel)) return;
    if (channel.guild.id !== utils.getInboxGuild().id) return;

    const thread = await threads.findOpenThreadByChannelId(channel.id);
    if (! thread) return;

    console.log(`[INFO] Fermeture automatique du fil avec ${thread.user_name} car le salon a été supprimé`);
    if (config.closeMessage) {
      const closeMessage = utils.readMultilineConfigValue(config.closeMessage);
      await thread.sendSystemMessageToUser(closeMessage).catch(() => {});
    }

    await thread.close(true);

    await sendCloseNotification(thread, `Le fil Modmail n°${thread.thread_number} avec ${thread.user_name} (${thread.user_id}) a été fermé automatiquement car le salon a été supprimé`);
  });
};
