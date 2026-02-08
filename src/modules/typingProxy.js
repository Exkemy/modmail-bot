const config = require("../cfg");
const threads = require("../data/threads");
const Eris = require("eris");

module.exports = ({ bot }) => {
  // Proxy de saisie : relaie les indicateurs de frappe entre les messages privés et le fil Modmail
  if(config.typingProxy || config.typingProxyReverse) {
    bot.on("typingStart", async (channel, user) => {
      if (! user) {
        // Si l'utilisateur n'existe pas dans le cache du bot, il sera indéfini ici
        return;
      }

      // config.typingProxy : relaie la saisie de l'utilisateur en message privé vers le fil Modmail
      if (config.typingProxy && !(channel instanceof Eris.GuildChannel)) {
        const thread = await threads.findOpenThreadByUserId(user.id);
        if (! thread) return;

        try {
          await bot.sendChannelTyping(thread.channel_id);
        } catch (e) {}
      }

      // config.typingProxyReverse : relaie la saisie du modérateur dans un fil vers les messages privés
      else if (config.typingProxyReverse && (channel instanceof Eris.GuildChannel) && ! user.bot) {
        const thread = await threads.findByChannelId(channel.id);
        if (! thread) return;

        const dmChannel = await thread.getDMChannel();
        if (! dmChannel) return;

        try {
          await bot.sendChannelTyping(dmChannel.id);
        } catch(e) {}
      }
    });
  }
};
