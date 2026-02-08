const ThreadMessage = require("../data/ThreadMessage");
const utils = require("../utils");

module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand("id", [], async (msg, args, thread) => {
    thread.postSystemMessage(thread.user_id);
  }, { allowSuspended: true });

  commands.addInboxThreadCommand("dm_channel_id", [], async (msg, args, thread) => {
    const dmChannel = await thread.getDMChannel();
    thread.postSystemMessage(dmChannel.id);
  }, { allowSuspended: true });

  commands.addInboxThreadCommand("message", "<messageNumber:number>", async (msg, args, thread) => {
    /** @type {ThreadMessage} */
    const threadMessage = await thread.findThreadMessageByMessageNumber(args.messageNumber);
    if (! threadMessage) {
      thread.postSystemMessage("Aucun message dans ce fil avec ce numéro");
      return;
    }

    const channelId = threadMessage.dm_channel_id;
    // Dans de rares cas spécifiques, comme createThreadOnMention, un message de fil peut provenir d'un serveur principal
    const channelIdServer = utils.getMainGuilds().find(g => g.channels.has(channelId));
    const messageLink = channelIdServer
      ? `https://discord.com/channels/${channelIdServer.id}/${channelId}/${threadMessage.dm_message_id}`
      : `https://discord.com/channels/@me/${channelId}/${threadMessage.dm_message_id}`;

    const parts = [
      `Détails pour le message \`${threadMessage.message_number}\` :`,
      `ID du salon : \`${channelId}\``,
      `ID du message : \`${threadMessage.dm_message_id}\``,
      `Lien : <${messageLink}>`,
    ];

    thread.postSystemMessage(parts.join("\n"));
  }, { allowSuspended: true });
};
