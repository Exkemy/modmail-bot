const utils = require("../utils");
const threads = require("../data/threads");
const {getOrFetchChannel} = require("../utils");

module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxServerCommand("newthread", "<userId:userId>", async (msg, args, thread) => {
    const user = bot.users.get(args.userId) || await bot.getRESTUser(args.userId).catch(() => null);
    if (! user) {
      utils.postSystemMessageWithFallback(msg.channel, thread, "Utilisateur introuvable !");
      return;
    }

    if (user.bot) {
      utils.postSystemMessageWithFallback(msg.channel, thread, "Impossible de créer un fil pour un bot");
      return;
    }

    const existingThread = await threads.findOpenThreadByUserId(user.id);
    if (existingThread) {
      utils.postSystemMessageWithFallback(msg.channel, thread, `Impossible de créer un nouveau fil ; un autre fil est ouvert avec cet utilisateur : <#${existingThread.channel_id}>`);
      return;
    }

    const createdThread = await threads.createNewThreadForUser(user, {
      quiet: true,
      ignoreRequirements: true,
      ignoreHooks: true,
      source: "command",
    });

    createdThread.postSystemMessage(`Fil ouvert par ${msg.author.nick || config.useDisplaynames ? msg.author.globalName || msg.author.username : msg.author.username}`);

    const channel = await getOrFetchChannel(bot, msg.channel.id);
    channel.createMessage(`Fil ouvert : <#${createdThread.channel_id}>`);
  });
};
