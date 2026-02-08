const attachments = require("../data/attachments");
const utils = require("../utils");
const Thread = require("../data/Thread");

module.exports = ({ bot, knex, config, commands }) => {
  // Les modérateurs peuvent répondre aux fils Modmail en utilisant !r ou !reply
  // Ces messages sont renvoyés dans le fil de messages privés entre le bot et l'utilisateur
  commands.addInboxThreadCommand("reply", "[text$]", async (msg, args, thread) => {
    if (! args.text && msg.attachments.length === 0) {
      utils.postError(msg.channel, "Texte ou pièce jointe requis");
      return;
    }

    const replied = await thread.replyToUser(msg.member, args.text || "", msg.attachments, config.forceAnon, msg.messageReference);
    if (replied) msg.delete();
  }, {
    aliases: ["r"]
  });

  // Les réponses anonymes n'affichent que le rôle, pas le nom d'utilisateur
  commands.addInboxThreadCommand("anonreply", "[text$]", async (msg, args, thread) => {
    if (! args.text && msg.attachments.length === 0) {
      utils.postError(msg.channel, "Texte ou pièce jointe requis");
      return;
    }

    const replied = await thread.replyToUser(msg.member, args.text || "", msg.attachments, true, msg.messageReference);
    if (replied) msg.delete();
  }, {
    aliases: ["ar"]
  });

  // Répond toujours avec le rôle et le nom d'utilisateur. Utile si forceAnon est activé.
  commands.addInboxThreadCommand("realreply", "[text$]", async (msg, args, thread) => {
    if (! args.text && msg.attachments.length === 0) {
      utils.postError(msg.channel, "Texte ou pièce jointe requis");
      return;
    }

    const replied = await thread.replyToUser(msg.member, args.text || "", msg.attachments, false, msg.messageReference);
    if (replied) msg.delete();
  }, {
    aliases: ["rr"]
  });

  if (config.allowStaffEdit) {
    commands.addInboxThreadCommand("edit", "<messageNumber:number> <text:string$>", async (msg, args, thread) => {
      const threadMessage = await thread.findThreadMessageByMessageNumber(args.messageNumber);
      if (! threadMessage) {
        utils.postError(msg.channel, "Numéro de message inconnu");
        return;
      }

      if (threadMessage.user_id !== msg.author.id) {
        utils.postError(msg.channel, "Vous pouvez uniquement modifier vos propres réponses");
        return;
      }

      const edited = await thread.editStaffReply(msg.member, threadMessage, args.text);
      if (edited) msg.delete().catch(utils.noop);
    }, {
      aliases: ["e"]
    });
  }

  if (config.allowStaffDelete) {
    commands.addInboxThreadCommand("delete", "<messageNumber:number>", async (msg, args, thread) => {
      const threadMessage = await thread.findThreadMessageByMessageNumber(args.messageNumber);
      if (! threadMessage) {
        utils.postError(msg.channel, "Numéro de message inconnu");
        return;
      }

      if (threadMessage.user_id !== msg.author.id) {
        utils.postError(msg.channel, "Vous pouvez uniquement supprimer vos propres réponses");
        return;
      }

      await thread.deleteStaffReply(msg.member, threadMessage);
      msg.delete().catch(utils.noop);
    }, {
      aliases: ["d"]
    });
  }
};
