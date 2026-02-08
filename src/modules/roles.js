const utils = require("../utils");
const {
  setModeratorDefaultRoleOverride,
  resetModeratorDefaultRoleOverride,

  setModeratorThreadRoleOverride,
  resetModeratorThreadRoleOverride,

  getModeratorThreadDisplayRoleName,
  getModeratorDefaultDisplayRoleName,
} = require("../data/displayRoles");
const {getOrFetchChannel} = require("../utils");

module.exports = ({ bot, knex, config, commands }) => {
  if (! config.allowChangingDisplayRole) {
    return;
  }

  function resolveRoleInput(input) {
    if (utils.isSnowflake(input)) {
      return utils.getInboxGuild().roles.get(input);
    }

    return utils.getInboxGuild().roles.find(r => r.name.toLowerCase() === input.toLowerCase());
  }

  // Obtient le rôle affiché pour un fil
  commands.addInboxThreadCommand("role", [], async (msg, args, thread) => {
    const displayRole = await getModeratorThreadDisplayRoleName(msg.member, thread.id);
    if (displayRole) {
      thread.postSystemMessage(`Votre rôle affiché dans ce fil est actuellement **${displayRole}**`);
    } else {
      thread.postSystemMessage("Vos réponses dans ce fil n'affichent actuellement aucun rôle");
    }
  }, { allowSuspended: true });

  // Réinitialise le rôle affiché pour un fil
  commands.addInboxThreadCommand("role reset", [], async (msg, args, thread) => {
    await resetModeratorThreadRoleOverride(msg.member.id, thread.id);

    const displayRole = await getModeratorThreadDisplayRoleName(msg.member, thread.id);
    if (displayRole) {
      thread.postSystemMessage(`Votre rôle affiché pour ce fil a été réinitialisé. Vos réponses afficheront désormais le rôle par défaut **${displayRole}**.`);
    } else {
      thread.postSystemMessage("Votre rôle affiché pour ce fil a été réinitialisé. Vos réponses n'afficheront plus de rôle.");
    }
  }, {
    aliases: ["role_reset", "reset_role"],
    allowSuspended: true,
  });

  // Définit le rôle affiché pour un fil
  commands.addInboxThreadCommand("role", "<role:string$>", async (msg, args, thread) => {
    const role = resolveRoleInput(args.role);
    if (! role || ! msg.member.roles.includes(role.id)) {
      thread.postSystemMessage("Aucun rôle correspondant trouvé. Assurez-vous de posséder le rôle avant de l'utiliser comme rôle affiché dans ce fil.");
      return;
    }

    await setModeratorThreadRoleOverride(msg.member.id, thread.id, role.id);
    thread.postSystemMessage(`Votre rôle affiché pour ce fil est défini sur **${role.name}**. Vous pouvez le réinitialiser avec \`${config.prefix}role reset\`.`);
  }, { allowSuspended: true });

  // Obtient le rôle affiché par défaut
  commands.addInboxServerCommand("role", [], async (msg, args, thread) => {
    const channel = await getOrFetchChannel(bot, msg.channel.id);
    const displayRole = await getModeratorDefaultDisplayRoleName(msg.member);
    if (displayRole) {
      channel.createMessage(`Votre rôle affiché par défaut est actuellement **${displayRole}**`);
    } else {
      channel.createMessage("Vos réponses n'affichent actuellement aucun rôle par défaut");
    }
  });

  // Réinitialise le rôle affiché par défaut
  commands.addInboxServerCommand("role reset", [], async (msg, args, thread) => {
    await resetModeratorDefaultRoleOverride(msg.member.id);

    const channel = await getOrFetchChannel(bot, msg.channel.id);
    const displayRole = await getModeratorDefaultDisplayRoleName(msg.member);
    if (displayRole) {
      channel.createMessage(`Votre rôle affiché par défaut a été réinitialisé. Vos réponses afficheront désormais le rôle **${displayRole}** par défaut.`);
    } else {
      channel.createMessage("Votre rôle affiché par défaut a été réinitialisé. Vos réponses n'afficheront plus de rôle par défaut.");
    }
  }, {
    aliases: ["role_reset", "reset_role"],
  });

  // Définit le rôle affiché par défaut
  commands.addInboxServerCommand("role", "<role:string$>", async (msg, args, thread) => {
    const channel = await getOrFetchChannel(bot, msg.channel.id);
    const role = resolveRoleInput(args.role);
    if (! role || ! msg.member.roles.includes(role.id)) {
      channel.createMessage("Aucun rôle correspondant trouvé. Assurez-vous de posséder le rôle avant de le définir comme rôle affiché par défaut.");
      return;
    }

    await setModeratorDefaultRoleOverride(msg.member.id, role.id);
    channel.createMessage(`Votre rôle affiché par défaut est défini sur **${role.name}**. Vous pouvez le réinitialiser avec \`${config.prefix}role reset\`.`);
  });
};
