module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand("alert", "[opt:string]", async (msg, args, thread) => {
    if (args.opt && args.opt.startsWith("c")) {
      await thread.removeAlert(msg.author.id)
      await thread.postSystemMessage("Alerte de nouveau message annulée");
    } else {
      await thread.addAlert(msg.author.id);
      await thread.postSystemMessage(`Notification envoyée à ${msg.author.nick || config.useDisplaynames ? msg.author.globalName || msg.author.username : msg.author.username} lorsque ce fil recevra une nouvelle réponse`);
    }
  }, { allowSuspended: true });
};
