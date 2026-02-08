const moment = require("moment");
const threads = require("../data/threads");
const utils = require("../utils");

const {THREAD_STATUS} = require("../data/constants");
const {getOrFetchChannel} = require("../utils");

module.exports = ({ bot, knex, config, commands }) => {
  if (! config.allowSuspend) return;
  // Vérifie les fils dont la suspension est planifiée et les suspend
  async function applyScheduledSuspensions() {
    const threadsToBeSuspended = await threads.getThreadsThatShouldBeSuspended();
    for (const thread of threadsToBeSuspended) {
      if (thread.status === THREAD_STATUS.OPEN) {
        await thread.suspend();
        await thread.postSystemMessage(`**Fil suspendu** comme prévu par ${thread.scheduled_suspend_name}. Ce fil sera considéré comme fermé jusqu'à sa réactivation avec \`${config.prefix}unsuspend\``);
      }
    }
  }

  async function scheduledSuspendLoop() {
    try {
      await applyScheduledSuspensions();
    } catch (e) {
      console.error(e);
    }

    setTimeout(scheduledSuspendLoop, 2000);
  }

  scheduledSuspendLoop();

  commands.addInboxThreadCommand("suspend cancel", [], async (msg, args, thread) => {
    // Annule la suspension programmée
    if (thread.scheduled_suspend_at) {
      await thread.cancelScheduledSuspend();
      thread.postSystemMessage("Suspension planifiée annulée");
    } else {
      thread.postSystemMessage("Le fil n'est pas programmé pour être suspendu");
    }
  });

  commands.addInboxThreadCommand("suspend", "[delay:delay]", async (msg, args, thread) => {
    if (thread.status === THREAD_STATUS.SUSPENDED) {
      thread.postSystemMessage("Le fil est déjà suspendu.");
      return;
    }
    if (args.delay) {
      const suspendAt = moment.utc().add(args.delay, "ms");
      await thread.scheduleSuspend(suspendAt.format("YYYY-MM-DD HH:mm:ss"), msg.author);

      thread.postSystemMessage(`Le fil sera suspendu dans ${utils.humanizeDelay(args.delay)}. Utilisez \`${config.prefix}suspend cancel\` pour annuler.`);

      return;
    }

    await thread.suspend();
    thread.postSystemMessage(`**Fil suspendu !** Ce fil sera considéré comme fermé jusqu'à sa réactivation avec \`${config.prefix}unsuspend\``);
  }, { allowSuspended: true });

  commands.addInboxServerCommand("unsuspend", [], async (msg, args, thread) => {
    if (thread) {
      thread.postSystemMessage("Le fil n'est pas suspendu");
      return;
    }

    thread = await threads.findSuspendedThreadByChannelId(msg.channel.id);
    if (! thread) {
      const channel = await getOrFetchChannel(bot, msg.channel.id);
      channel.createMessage("Pas dans un fil");
      return;
    }

    const otherOpenThread = await threads.findOpenThreadByUserId(thread.user_id);
    if (otherOpenThread) {
      thread.postSystemMessage(`Impossible de réactiver ; un autre fil est ouvert avec cet utilisateur : <#${otherOpenThread.channel_id}>`);
      return;
    }

    await thread.unsuspend();
    thread.postSystemMessage("**Fil réactivé !**");
  });
};
