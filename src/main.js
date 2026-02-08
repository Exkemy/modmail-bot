const Eris = require("eris");
const path = require("path");

const config = require("./cfg");
const bot = require("./bot");
const knex = require("./knex");
const { messageQueue } = require("./queue");
const utils = require("./utils");
const { formatters } = require("./formatters")
const { createCommandManager } = require("./commands");
const { getPluginAPI, installPlugins, loadPlugins } = require("./plugins");
const ThreadMessage = require("./data/ThreadMessage");

const blocked = require("./data/blocked");
const threads = require("./data/threads");
const updates = require("./data/updates");
const { findUserProfile, saveLanguage } = require("./data/userProfiles");

const { ACCIDENTAL_THREAD_MESSAGES } = require("./data/constants");
const {getOrFetchChannel} = require("./utils");
const { getLanguageName, normalizeLanguage } = require("./translation");

const TICKET_LANGUAGE_SELECT_CUSTOM_ID = "ticket_language_select";
const TICKET_REASON_SELECT_CUSTOM_ID = "ticket_reason_select";

const DEFAULT_LANGUAGE = config.defaultLanguage || "fr";

// Whether language selection is enabled (configurable, default: true)
const ENABLE_LANGUAGE_SELECTION = config.enableLanguageSelection !== false;

// Supported languages: read from config or use built-in defaults
const SUPPORTED_LANGUAGES = getConfiguredLanguages();

function getConfiguredLanguages() {
  if (config.supportedLanguages && Array.isArray(config.supportedLanguages) && config.supportedLanguages.length > 0) {
    return config.supportedLanguages.filter(lang => lang && lang.value && lang.label);
  }
  return [
    { value: "fr", label: "🇫🇷 Francais" },
    { value: "en", label: "🇬🇧 English" },
    { value: "de", label: "🇩🇪 German" },
    { value: "es", label: "🇪🇸 Spanish" },
    { value: "ru", label: "🇷🇺 Russian" },
  ];
}

// Language strings for UI (built-in defaults; fr strings can be overridden via config)
const LANGUAGE_STRINGS = {
  fr: {
    languagePrompt: config.languagePrompt || "Choisis ta langue pour continuer :",
    languagePlaceholder: config.languagePlaceholder || "Choisir une langue",
    reasonPrompt: config.ticketReasonPrompt || "Merci de preciser la raison de votre ticket :",
    reasonPlaceholder: config.ticketReasonPlaceholder || "Raison du ticket",
    ticketOpened: (reasonLabel) => {
      const tpl = config.ticketOpenedMessage || "Votre ticket a bien ete ouvert pour {reason}. Un membre du staff vous repondra prochainement.";
      return tpl.replace(/\{reason\}/g, reasonLabel || "");
    },
    ticketOpenedNoReason: config.ticketOpenedMessageNoReason || "Votre ticket a bien ete ouvert. Un membre du staff vous repondra prochainement.",
    errorOpen: config.ticketErrorMessage || "Une erreur est survenue lors de l'ouverture du ticket. Merci de reessayer.",
    invalidMenu: "Ce menu n'est plus valide. Merci de renvoyer votre message pour ouvrir un ticket.",
    invalidChoice: "Ce choix n'est pas valide. Merci de reessayer.",
    reasonInvalid: "Cette raison n'est pas valide. Merci de reessayer.",
  },
  en: {
    languagePrompt: "Choose your language to continue:",
    languagePlaceholder: "Select a language",
    reasonPrompt: "Please select a reason for your ticket:",
    reasonPlaceholder: "Ticket reason",
    ticketOpened: (reasonLabel) => `Your ticket has been opened for ${reasonLabel}. A staff member will reply soon.`,
    ticketOpenedNoReason: "Your ticket has been opened. A staff member will reply soon.",
    errorOpen: "Something went wrong while opening the ticket. Please try again.",
    invalidMenu: "This menu is no longer valid. Please send your message again to open a ticket.",
    invalidChoice: "This choice is not valid. Please try again.",
    reasonInvalid: "This reason is not valid. Please try again.",
  },
  de: {
    languagePrompt: "Wahle deine Sprache aus:",
    languagePlaceholder: "Sprache auswahlen",
    reasonPrompt: "Bitte wahl einen Grund fur dein Ticket:",
    reasonPlaceholder: "Ticketgrund",
    ticketOpened: (reasonLabel) => `Dein Ticket wurde fur ${reasonLabel} eroffnet. Ein Teammitglied meldet sich bald.`,
    ticketOpenedNoReason: "Dein Ticket wurde eroffnet. Ein Teammitglied meldet sich bald.",
    errorOpen: "Beim Offnen des Tickets ist ein Fehler aufgetreten. Bitte versuche es erneut.",
    invalidMenu: "Dieses Menu ist nicht mehr gultig. Bitte sende deine Nachricht erneut.",
    invalidChoice: "Diese Auswahl ist ungultig. Bitte versuche es erneut.",
    reasonInvalid: "Dieser Grund ist ungultig. Bitte versuche es erneut.",
  },
  es: {
    languagePrompt: "Elige tu idioma para continuar:",
    languagePlaceholder: "Seleccionar idioma",
    reasonPrompt: "Elige el motivo de tu ticket:",
    reasonPlaceholder: "Motivo del ticket",
    ticketOpened: (reasonLabel) => `Tu ticket se abrio para ${reasonLabel}. Un miembro del staff te respondera pronto.`,
    ticketOpenedNoReason: "Tu ticket se abrio. Un miembro del staff te respondera pronto.",
    errorOpen: "Ocurrio un error al abrir el ticket. Por favor, intentalo de nuevo.",
    invalidMenu: "Este menu ya no es valido. Vuelve a enviar tu mensaje.",
    invalidChoice: "Esta opcion no es valida. Intentalo de nuevo.",
    reasonInvalid: "Este motivo no es valido. Intentalo de nuevo.",
  },
  ru: {
    languagePrompt: "Выбери язык, чтобы продолжить:",
    languagePlaceholder: "Выбери язык",
    reasonPrompt: "Уточните причину тикета:",
    reasonPlaceholder: "Причина тикета",
    ticketOpened: (reasonLabel) => `Ваш тикет открыт: ${reasonLabel}. Сотрудник ответит в ближайшее время.`,
    ticketOpenedNoReason: "Ваш тикет открыт. Сотрудник ответит в ближайшее время.",
    errorOpen: "Произошла ошибка при открытии тикета. Попробуйте еще раз.",
    invalidMenu: "Это меню больше недействительно. Отправьте сообщение заново.",
    invalidChoice: "Этот выбор недействителен. Попробуйте еще раз.",
    reasonInvalid: "Эта причина недействительна. Попробуйте еще раз.",
  },
};

// Load ticket reason options from config (flat list)
const TICKET_REASON_OPTIONS = getConfiguredReasonOptions();

function getConfiguredReasonOptions() {
  let options = config.ticketReasonOptions;

  // Handle legacy object format (pve/pvp modes) - auto-flatten
  if (options && typeof options === "object" && ! Array.isArray(options)) {
    const flatOptions = [];
    const seen = new Set();
    for (const mode of Object.keys(options)) {
      if (Array.isArray(options[mode])) {
        for (const opt of options[mode]) {
          if (opt && opt.value && ! seen.has(opt.value)) {
            seen.add(opt.value);
            flatOptions.push(opt);
          }
        }
      }
    }
    options = flatOptions;
  }

  if (Array.isArray(options) && options.length > 0) {
    return options.filter(item => item && item.label && item.value).map(item => ({
      label: String(item.label).trim(),
      value: String(item.value).trim(),
    }));
  }

  return [];
}

// Build a map for quick lookup: value -> { value, label }
const TICKET_REASON_MAP = new Map(
  TICKET_REASON_OPTIONS.map(reason => [reason.value, reason])
);

const pendingTicketWorkflows = new Map();

module.exports = {
  async start() {
    console.log("Préparation des plugins...");
    await installAllPlugins();

    console.log("Connexion à Discord...");

    bot.once("ready", async () => {
      console.log("Connecté ! En attente que les serveurs deviennent disponibles...");

      await (new Promise(resolve => {
        const waitNoteTimeout = setTimeout(() => {
          console.log("Les serveurs ne sont pas devenus disponibles après 15 secondes, poursuite du démarrage malgré tout");
          console.log("");

          const isSingleServer = config.mainServerId.includes(config.inboxServerId);
          if (isSingleServer) {
            console.log("AVERTISSEMENT : Le bot ne fonctionnera pas avant d'être invité sur le serveur.");
          } else {
            const hasMultipleMainServers = config.mainServerId.length > 1;
            if (hasMultipleMainServers) {
              console.log("AVERTISSEMENT : Le bot ne fonctionnera pas correctement tant qu'il n'est pas invité sur *tous* les serveurs principaux et sur le serveur de la boîte de réception.");
            } else {
              console.log("AVERTISSEMENT : Le bot ne fonctionnera pas correctement tant qu'il n'est pas invité à la fois sur le serveur principal et sur le serveur de la boîte de réception.");
            }
          }

          console.log("");

          resolve();
        }, 15 * 1000);

        Promise.all([
          ...config.mainServerId.map(id => waitForGuild(id)),
          waitForGuild(config.inboxServerId),
        ]).then(() => {
          clearTimeout(waitNoteTimeout);
          resolve();
        });
      }));

      console.log("Initialisation...");
      initStatus();
      initBaseMessageHandlers();
      initUpdateNotifications();

      console.log("Chargement des plugins...");
      const pluginResult = await loadAllPlugins();
      console.log(`Chargé ${pluginResult.loadedCount} plugins (${pluginResult.baseCount} plugins intégrés, ${pluginResult.externalCount} plugins externes)`);

      console.log("");
      console.log("Terminé ! En écoute des messages privés.");
      console.log("");

      // Log ticket configuration
      if (TICKET_REASON_OPTIONS.length > 0) {
        console.log(`Menu de raisons de ticket configuré avec ${TICKET_REASON_OPTIONS.length} option(s).`);
      } else {
        console.log("Aucune raison de ticket configurée - les tickets s'ouvriront directement.");
      }
      if (ENABLE_LANGUAGE_SELECTION) {
        console.log(`Sélection de langue activée (${SUPPORTED_LANGUAGES.length} langues).`);
      }
      console.log("");

      const openThreads = await threads.getAllOpenThreads();
      for (const thread of openThreads) {
        try {
          await thread.recoverDowntimeMessages();
        } catch (err) {
          console.error(`Erreur lors de la récupération des messages pour ${thread.user_id} : ${err}`);
        }
      }
    });

    bot.connect();
  }
};

function waitForGuild(guildId) {
  if (bot.guilds.has(guildId)) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    bot.on("guildAvailable", guild => {
      if (guild.id === guildId) {
        resolve();
      }
    });
  });
}

function initStatus() {
  function applyStatus() {
    const type = {
      "playing": Eris.Constants.ActivityTypes.GAME,
      "watching": Eris.Constants.ActivityTypes.WATCHING,
      "listening": Eris.Constants.ActivityTypes.LISTENING,
      "streaming": Eris.Constants.ActivityTypes.STREAMING,
    }[config.statusType] || Eris.Constants.ActivityTypes.GAME;

    if (type === Eris.Constants.ActivityTypes.STREAMING) {
      bot.editStatus(null, { name: config.status, type, url: config.statusUrl });
    } else {
      bot.editStatus(null, { name: config.status, type });
    }
  }

  if (config.status == null || config.status === "" || config.status === "none" || config.status === "off") {
    return;
  }

  // Set the bot status initially, then reapply it every hour since in some cases it gets unset
  applyStatus();
  setInterval(applyStatus, 60 * 60 * 1000);
}

function initBaseMessageHandlers() {
  /**
   * When a moderator posts in a modmail thread...
   * 1) If alwaysReply is enabled, reply to the user
   * 2) If alwaysReply is disabled, save that message as a chat message in the thread
   */
  bot.on("messageCreate", async msg => {
    if (! await utils.messageIsOnInboxServer(bot, msg)) return;
    if (msg.author.id === bot.user.id) return;

    const thread = await threads.findByChannelId(msg.channel.id);
    if (! thread) return;

    if (! msg.author.bot && (msg.content.startsWith(config.prefix) || msg.content.startsWith(config.snippetPrefix))) {
      // Save commands as "command messages"
      thread.saveCommandMessageToLogs(msg);
    } else if (! msg.author.bot && config.alwaysReply) {
      // AUTO-REPLY: If config.alwaysReply is enabled, send all chat messages in thread channels as replies
      if (! utils.isStaff(msg.member)) return; // Only staff are allowed to reply

      const replied = await thread.replyToUser(msg.member, msg.content.trim(), msg.attachments, config.alwaysReplyAnon || false, msg.messageReference);
      if (replied) msg.delete();
    } else {
      // Otherwise just save the messages as "chat" in the logs
      thread.saveChatMessageToLogs(msg);
    }
  });

  /**
   * When we get a private message...
   * 1) Find the open modmail thread for this user, or create a new one
   * 2) Post the message as a user reply in the thread
   */
  bot.on("messageCreate", async msg => {
    const channel = await getOrFetchChannel(bot, msg.channel.id);
    if (! (channel instanceof Eris.PrivateChannel)) return;
    if (msg.author.bot) return;
    if (msg.type !== Eris.Constants.MessageTypes.DEFAULT && msg.type !== Eris.Constants.MessageTypes.REPLY) return; // Ignore pins etc.

    if (await blocked.isBlocked(msg.author.id)) {
      if (config.blockedReply != null) {
        channel.createMessage(config.blockedReply).catch(utils.noop); //ignore silently
      }
      return;
    }

    // Private message handling is queued so e.g. multiple message in quick succession do not result in multiple channels being created
    messageQueue.add(async () => {
      const existingThread = await threads.findOpenThreadByUserId(msg.author.id);
      if (existingThread) {
        await existingThread.receiveUserReply(msg);
        return;
      }

      const existingWorkflow = pendingTicketWorkflows.get(msg.author.id);
      if (existingWorkflow) {
        existingWorkflow.messages.push(msg);
        await handlePendingWorkflowMessage(msg.author.id, existingWorkflow, msg);
        return;
      }

      if (config.ignoreAccidentalThreads && msg.content && ACCIDENTAL_THREAD_MESSAGES.includes(msg.content.trim().toLowerCase())) return;

      const profile = await findUserProfile(msg.author.id);
      const storedLanguage = profile && profile.language ? normalizeLanguage(profile.language) : null;

      const hasReasonOptions = TICKET_REASON_OPTIONS.length > 0;
      const needsLanguage = ENABLE_LANGUAGE_SELECTION && ! storedLanguage;
      const needsWorkflow = needsLanguage || hasReasonOptions;

      if (! needsWorkflow) {
        // No interactive steps needed - create ticket directly
        const workflow = {
          channel,
          messages: [msg],
          language: storedLanguage || DEFAULT_LANGUAGE,
          reason: null,
          prompts: {},
        };
        try {
          await finalizeTicketCreation(msg.author.id, workflow, null);
        } finally {
          pendingTicketWorkflows.delete(msg.author.id);
        }
        return;
      }

      const workflow = {
        channel,
        messages: [msg],
        language: ENABLE_LANGUAGE_SELECTION ? storedLanguage : DEFAULT_LANGUAGE,
        reason: null,
        prompts: {},
      };

      pendingTicketWorkflows.set(msg.author.id, workflow);

      if (needsLanguage) {
        await promptForLanguage(msg.author.id, workflow);
      } else if (hasReasonOptions) {
        await promptForReason(msg.author.id, workflow);
      }
    });
  });

  bot.on("interactionCreate", async interaction => {
    if (interaction.type !== Eris.Constants.InteractionTypes.MESSAGE_COMPONENT) return;

    const userId = (interaction.user && interaction.user.id) || (interaction.member && interaction.member.id);
    if (! userId) return;

    if (interaction.data.component_type !== Eris.Constants.ComponentTypes.SELECT_MENU) return;

    if (interaction.data.custom_id === TICKET_LANGUAGE_SELECT_CUSTOM_ID) {
      await handleLanguageSelection(interaction, userId);
      return;
    }

    if (interaction.data.custom_id === TICKET_REASON_SELECT_CUSTOM_ID) {
      await handleReasonSelection(interaction, userId);
      return;
    }
  });

  /**
   * When a message is edited...
   * 1) If that message was in DMs, and we have a thread open with that user, post the edit as a system message in the thread, or edit the thread message
   * 2) If that message was moderator chatter in the thread, update the corresponding chat message in the DB
   */
  bot.on("messageUpdate", async (msg, oldMessage) => {
    if (! msg || ! msg.content) return;

    const threadMessage = await threads.findThreadMessageByDMMessageId(msg.id);
    if (! threadMessage) {
      return;
    }

    const thread = await threads.findById(threadMessage.thread_id);
    if (thread.isClosed()) {
      return;
    }

    // FIXME: There is a small bug here. When we don't have the old message cached (i.e. when we use threadMessage.body as oldContent),
    //        multiple edits of the same message will show the unedited original content as the "before" version in the logs.
    //        To fix this properly, we'd have to store both the original version and the current edited version in the thread message,
    //        and it's probably not worth it.
    const oldContent = (oldMessage && oldMessage.content) || threadMessage.body;
    const newContent = msg.content;

    if (threadMessage.isFromUser()) {
      const editMessage = utils.disableLinkPreviews(`**L'utilisateur a modifié son message :**\n\`AVANT :\` ${oldContent}\n\`APRÈS :\` ${newContent}`);

      if (config.updateMessagesLive) {
        // When directly updating the message in the staff view, we still want to keep the original content in the logs.
        // To do this, we don't edit the log message at all and instead add a fake system message that includes the edit.
        // This mirrors how the logs would look when we're not directly updating the message.
        await thread.addSystemMessageToLogs(editMessage);

        const threadMessageWithEdit = threadMessage.clone();
        threadMessageWithEdit.body = newContent;
        const formatted = await formatters.formatUserReplyThreadMessage(threadMessageWithEdit);
        await bot.editMessage(thread.channel_id, threadMessage.inbox_message_id, formatted).catch(console.warn);
      } else {
        await thread.postSystemMessage(editMessage);
      }
    }

    if (threadMessage.isChat()) {
      thread.updateChatMessageInLogs(msg);
    }
  });


  /**
   * When a message is deleted...
   * 1) If that message was in DMs, and we have a thread open with that user, delete the thread message
   * 2) If that message was moderator chatter in the thread, delete it from the database as well
   */
  bot.on("messageDelete", async msg => {
    const threadMessage = await threads.findThreadMessageByDMMessageId(msg.id);
    if (! threadMessage) return;

    const thread = await threads.findById(threadMessage.thread_id);
    if (thread.isClosed()) {
      return;
    }

    if (threadMessage.isFromUser() && config.updateMessagesLive) {
      // If the deleted message was in DMs and updateMessagesLive is enabled, reflect the deletion in staff view
      bot.deleteMessage(thread.channel_id, threadMessage.inbox_message_id);
    }

    if (threadMessage.isChat()) {
      // If the deleted message was staff chatter in the thread channel, also delete it from the logs
      thread.deleteChatMessageFromLogs(msg.id);
    }
  });

  /**
   * When the bot is mentioned on the main server, ping staff in the log channel about it
   */
  bot.on("messageCreate", async msg => {
    const channel = await getOrFetchChannel(bot, msg.channel.id);
    if (! await utils.messageIsOnMainServer(bot, msg)) return;
    if (! msg.mentions.some(user => user.id === bot.user.id)) return;
    if (msg.author.bot) return;

    if (await utils.messageIsOnInboxServer(bot, msg)) {
      // For same server setups, check if the person who pinged modmail is staff. If so, ignore the ping.
      if (utils.isStaff(msg.member)) return;
    } else {
      // For separate server setups, check if the member is staff on the modmail server
      const inboxMember = utils.getInboxGuild().members.get(msg.author.id);
      if (inboxMember && utils.isStaff(inboxMember)) return;
    }

    // If the person who mentioned the bot is blocked, ignore them
    if (await blocked.isBlocked(msg.author.id)) return;

    let content;
    const mainGuilds = utils.getMainGuilds();
    const staffMention = (config.pingOnBotMention ? utils.getInboxMention() : "");
    const allowedMentions = (config.pingOnBotMention ? utils.getInboxMentionAllowedMentions() : undefined);

    const userMentionStr = `**${msg.author.username}** (\`${msg.author.id}\`)`;
    const messageLink = `https:\/\/discord.com\/channels\/${channel.guild.id}\/${channel.id}\/${msg.id}`;

    if (mainGuilds.length === 1) {
        content = `${staffMention}Bot mentionné dans ${channel.mention} par ${userMentionStr} : "${msg.content}"\n\n<${messageLink}>`;
    } else {
        content = `${staffMention}Bot mentionné dans ${channel.mention} (${channel.guild.name}) par ${userMentionStr} : "${msg.content}"\n\n<${messageLink}>`;
    }

    content = utils.chunkMessageLines(content);
    const logChannelId = utils.getLogChannel().id;
    for (let i = 0; i < content.length; i++) {
      await bot.createMessage(logChannelId, {
        content: content[i],
        allowedMentions,
      });
    }

    // Send an auto-response to the mention, if enabled
    if (config.botMentionResponse) {
      const botMentionResponse = utils.readMultilineConfigValue(config.botMentionResponse);
      bot.createMessage(channel.id, {
        content: botMentionResponse.replace(/{userMention}/g, `<@${msg.author.id}>`),
        allowedMentions: {
          users: [msg.author.id]
        }
      });
    }

    // If configured, automatically open a new thread with a user who has pinged it
    if (config.createThreadOnMention) {
      const existingThread = await threads.findOpenThreadByUserId(msg.author.id);
      if (! existingThread) {
        // Only open a thread if we don't already have one
        const createdThread = await threads.createNewThreadForUser(msg.author, { quiet: true });
        await createdThread.postSystemMessage(`Ce fil a été ouvert à partir d'une mention du bot dans <#${channel.id}>`);
        await createdThread.receiveUserReply(msg);
      }
    }
  });
}

async function handleLanguageSelection(interaction, userId) {
  const workflow = pendingTicketWorkflows.get(userId);
  const strings = getLanguageStrings(workflow && workflow.language);

  if (! workflow) {
    await interaction.createMessage({ content: strings.invalidMenu }).catch(utils.noop);
    return;
  }

  const selectedValue = interaction.data.values && interaction.data.values[0];
  const language = SUPPORTED_LANGUAGES.find(lang => lang.value === selectedValue);

  if (! language) {
    await interaction.createMessage({ content: strings.invalidChoice }).catch(utils.noop);
    return;
  }

  try {
    await interaction.deferUpdate();
  } catch (err) {
    console.error(`Erreur lors de la selection de la langue pour ${userId} : ${err.message || err}`);
  }

  if (interaction.message && typeof interaction.message.delete === "function") {
    interaction.message.delete().catch(utils.noop);
  }

  messageQueue.add(async () => {
    workflow.language = language.value;
    await deletePromptMessage(workflow.channel, workflow.prompts.language);
    workflow.prompts.language = null;

    // Save language to user profile
    try {
      await saveLanguage(userId, workflow.language);
    } catch (err) {
      console.error(`Erreur lors de la mise a jour de la langue pour ${userId} : ${err.message || err}`);
    }

    // Next step: reason selection or finalize
    if (TICKET_REASON_OPTIONS.length > 0) {
      await promptForReason(userId, workflow);
    } else {
      try {
        await finalizeTicketCreation(userId, workflow, null);
      } finally {
        pendingTicketWorkflows.delete(userId);
      }
    }
  });
}

async function handlePendingWorkflowMessage(userId, workflow, msg) {
  // Handle !lang command
  if (ENABLE_LANGUAGE_SELECTION) {
    const languageCommand = (msg.content || "").trim().match(/^!lang(?:uage)?\s+([a-z]{2})\s*$/i);
    if (languageCommand) {
      const requestedLanguage = languageCommand[1].toLowerCase();
      const supportedLanguageValues = SUPPORTED_LANGUAGES.map(lang => lang.value);

      if (! supportedLanguageValues.includes(requestedLanguage)) {
        await workflow.channel.createMessage(`Langue inconnue. Langues disponibles : ${supportedLanguageValues.join(", ")}.`).catch(utils.noop);
        return;
      }

      workflow.language = normalizeLanguage(requestedLanguage);
      await deletePromptMessage(workflow.channel, workflow.prompts.language);
      workflow.prompts.language = null;

      try {
        await saveLanguage(userId, workflow.language);
      } catch (err) {
        console.error(`Erreur lors de la mise a jour de la langue pour ${userId} : ${err.message || err}`);
      }

      await workflow.channel.createMessage(`Langue mise a jour sur ${getLanguageName(workflow.language)}.`).catch(utils.noop);

      if (TICKET_REASON_OPTIONS.length > 0 && ! workflow.reason) {
        await promptForReason(userId, workflow);
      } else {
        try {
          await finalizeTicketCreation(userId, workflow, null);
        } finally {
          pendingTicketWorkflows.delete(userId);
        }
      }

      return;
    }
  }

  // If still waiting for language selection
  if (ENABLE_LANGUAGE_SELECTION && ! workflow.language) {
    await promptForLanguage(userId, workflow);
    return;
  }

  // If still waiting for reason selection
  if (TICKET_REASON_OPTIONS.length > 0 && ! workflow.reason) {
    await promptForReason(userId, workflow);
    return;
  }
}

async function handleReasonSelection(interaction, userId) {
  const workflow = pendingTicketWorkflows.get(userId);
  const strings = getLanguageStrings(workflow && workflow.language);

  if (! workflow) {
    await interaction.createMessage({
      content: strings.invalidMenu,
    }).catch(utils.noop);
    return;
  }

  const selectedValue = interaction.data.values && interaction.data.values[0];
  const reason = TICKET_REASON_MAP.get(selectedValue);
  if (! reason) {
    await interaction.createMessage({ content: strings.reasonInvalid }).catch(utils.noop);
    return;
  }

  try {
    await interaction.deferUpdate();
  } catch (err) {
    console.error(`Erreur lors de l'accuse de reception de la raison pour ${userId} : ${err.message || err}`);
  }

  if (interaction.message && typeof interaction.message.delete === "function") {
    interaction.message.delete().catch(utils.noop);
  }

  messageQueue.add(async () => {
    try {
      workflow.reason = reason.value;
      await finalizeTicketCreation(userId, workflow, reason);
    } finally {
      pendingTicketWorkflows.delete(userId);
    }
  });
}

async function promptForLanguage(userId, workflow) {
  if (! workflow || ! workflow.channel) return;
  if (workflow.language) return;
  if (workflow.prompts.language) return;

  const promptText = `${LANGUAGE_STRINGS.fr.languagePrompt}\n${LANGUAGE_STRINGS.en.languagePrompt}`;

  try {
    const promptMessage = await workflow.channel.createMessage({
      content: promptText,
      components: [
        {
          type: 1,
          components: [
            {
              type: Eris.Constants.ComponentTypes.SELECT_MENU,
              custom_id: TICKET_LANGUAGE_SELECT_CUSTOM_ID,
              placeholder: LANGUAGE_STRINGS.en.languagePlaceholder,
              min_values: 1,
              max_values: 1,
              options: SUPPORTED_LANGUAGES.map(lang => ({
                label: lang.label,
                value: lang.value,
              })),
            }
          ]
        }
      ]
    });

    workflow.prompts.language = promptMessage.id;
  } catch (err) {
    console.error(`Erreur lors de la demande de la langue pour ${userId} : ${err.message || err}`);
  }
}

async function promptForReason(userId, workflow) {
  if (! workflow || ! workflow.channel) return;
  if (workflow.prompts.reason) return;

  const options = getReasonOptions();
  if (options.length === 0) return;

  const strings = getLanguageStrings(workflow.language);

  try {
    const promptMessage = await workflow.channel.createMessage({
      content: strings.reasonPrompt,
      components: [
        {
          type: 1,
          components: [
            {
              type: Eris.Constants.ComponentTypes.SELECT_MENU,
              custom_id: TICKET_REASON_SELECT_CUSTOM_ID,
              placeholder: strings.reasonPlaceholder,
              min_values: 1,
              max_values: 1,
              options,
            }
          ]
        }
      ]
    });

    workflow.prompts.reason = promptMessage.id;
  } catch (err) {
    console.error(`Erreur lors de l'envoi du menu de raison pour ${userId} : ${err.message || err}`);
  }
}

function getReasonOptions() {
  return TICKET_REASON_OPTIONS.map(reason => ({
    label: reason.label,
    value: reason.value,
  }));
}

async function deletePromptMessage(channel, messageId) {
  if (! messageId || ! channel || typeof channel.deleteMessage !== "function") return;

  try {
    await channel.deleteMessage(messageId);
  } catch (err) {}
}

async function clearWorkflowPrompts(workflow) {
  if (! workflow || ! workflow.channel) return;

  await deletePromptMessage(workflow.channel, workflow.prompts.language);
  await deletePromptMessage(workflow.channel, workflow.prompts.reason);

  workflow.prompts.language = null;
  workflow.prompts.reason = null;
}

function getLanguageStrings(language) {
  const normalized = normalizeLanguage(language);
  return LANGUAGE_STRINGS[normalized] || LANGUAGE_STRINGS[DEFAULT_LANGUAGE] || LANGUAGE_STRINGS.fr;
}

function resolveTicketReasonConfig(reason) {
  let reasonConfig = null;

  if (config.ticketReasons) {
    // Try new flat format: ticketReasons.report_member.allowedRoles
    if (config.ticketReasons[reason.value]) {
      reasonConfig = config.ticketReasons[reason.value];
    } else {
      // Try legacy nested format: ticketReasons.pve.report_member.allowedRoles
      for (const key of Object.keys(config.ticketReasons)) {
        const nested = config.ticketReasons[key];
        if (nested && typeof nested === "object" && nested[reason.value]) {
          reasonConfig = nested[reason.value];
          break;
        }
      }
    }
  }

  const categoryId = (reasonConfig && reasonConfig.categoryId)
    || (config.categoryAutomation && config.categoryAutomation.newThreadFromReason && config.categoryAutomation.newThreadFromReason[reason.value])
    || null;

  const mentionRole = reasonConfig && reasonConfig.mentionRole
    ? (Array.isArray(reasonConfig.mentionRole) ? reasonConfig.mentionRole : [reasonConfig.mentionRole]).filter(Boolean)
    : null;
  const allowedRoles = reasonConfig && reasonConfig.allowedRoles
    ? (Array.isArray(reasonConfig.allowedRoles) ? reasonConfig.allowedRoles : [reasonConfig.allowedRoles]).filter(Boolean)
    : null;

  return { categoryId, mentionRole, allowedRoles };
}

async function finalizeTicketCreation(userId, workflow, reason) {
  const dmChannel = workflow.channel;
  const storedMessages = workflow.messages.slice();
  const firstMessage = storedMessages[0];
  let user = firstMessage ? firstMessage.author : null;
  const strings = getLanguageStrings(workflow.language);

  if (! user) {
    user = (dmChannel && dmChannel.recipient) || bot.users.get(userId) || await bot.getRESTUser(userId).catch(() => null);
  }

  try {
    let thread = await threads.findOpenThreadByUserId(userId);
    let createdThread = false;

    if (! thread) {
      if (! user) {
        throw new Error("Utilisateur introuvable pour la creation du ticket");
      }

      const threadCreationOpts = {
        source: "dm",
      };

      if (reason) {
        const routing = resolveTicketReasonConfig(reason);
        threadCreationOpts.ticketReason = reason.value;

        if (routing.categoryId) {
          threadCreationOpts.categoryId = routing.categoryId;
        }

        if (routing.mentionRole) {
          threadCreationOpts.mentionRole = routing.mentionRole;
        }

        if (routing.allowedRoles) {
          threadCreationOpts.allowedRoles = routing.allowedRoles;
        }
      }

      if (firstMessage) {
        threadCreationOpts.message = firstMessage;
      }

      thread = await threads.createNewThreadForUser(user, threadCreationOpts);

      if (thread) {
        createdThread = true;
      }
    }

    if (! thread) {
      if (dmChannel) {
        await dmChannel.createMessage(strings.errorOpen).catch(utils.noop);
      }
      return;
    }

    // Save metadata
    try {
      if (reason) {
        await thread.setMetadataValue("ticketReason", { value: reason.value, label: reason.label });
      }
      await thread.setMetadataValue("ticketLanguage", normalizeLanguage(workflow.language || DEFAULT_LANGUAGE));
    } catch (err) {
      console.error(`Erreur lors de l'enregistrement des metadonnees du ticket pour ${userId} : ${err.message || err}`);
    }

    // Send ticket info embed to inbox (if enabled)
    if (config.ticketEmbed !== false) {
      const embed = buildTicketOpenedEmbed(user, reason ? reason.label : null, workflow.language);
      try {
        await bot.createMessage(thread.channel_id, { embeds: [embed] });
      } catch (err) {
        console.error(`Erreur lors de l'envoi de l'embed d'ouverture de ticket pour ${userId} : ${err}`);
      }
    }

    // Forward all queued messages
    for (const storedMessage of storedMessages) {
      await thread.receiveUserReply(storedMessage);
    }

    // Send auto-response
    if (createdThread && config.responseMessage) {
      const responseMessage = utils.readMultilineConfigValue(config.responseMessage);

      try {
        const postToThreadChannel = config.showResponseMessageInThreadChannel;
        await thread.sendSystemMessageToUser(responseMessage, { postToThreadChannel });
      } catch (err) {
        await thread.postSystemMessage(`**REMARQUE:** Impossible d'envoyer la reponse automatique a l'utilisateur. L'erreur retournee est : ${err.message}`);
      }
    }

    // Send confirmation to user
    if (dmChannel) {
      if (reason) {
        await dmChannel.createMessage(strings.ticketOpened(reason.label)).catch(utils.noop);
      } else {
        await dmChannel.createMessage(strings.ticketOpenedNoReason).catch(utils.noop);
      }
    }
  } catch (err) {
    console.error(`Erreur lors du traitement de la selection de ticket pour ${userId} : ${err.stack || err}`);
    if (dmChannel) {
      await dmChannel.createMessage(strings.errorOpen).catch(utils.noop);
    }
  } finally {
    await clearWorkflowPrompts(workflow);
  }
}

function initUpdateNotifications() {
  if (config.updateNotifications) {
    updates.startVersionRefreshLoop();
  }
}

function getBasePlugins() {
  return [
    "file:./src/modules/reply",
    "file:./src/modules/close",
    "file:./src/modules/logs",
    "file:./src/modules/block",
    "file:./src/modules/move",
    "file:./src/modules/snippets",
    "file:./src/modules/suspend",
    "file:./src/modules/greeting",
    "file:./src/modules/webserverPlugin",
    "file:./src/modules/typingProxy",
    "file:./src/modules/version",
    "file:./src/modules/newthread",
    "file:./src/modules/id",
    "file:./src/modules/alert",
    "file:./src/modules/joinLeaveNotification",
    "file:./src/modules/roles",
    "file:./src/modules/notes",
  ];
}

function getExternalPlugins() {
  return config.plugins;
}

function getAllPlugins() {
  return [...getBasePlugins(), ...getExternalPlugins()];
}

function formatUserTag(user) {
  if (! user) return "Inconnu";
  if (user.discriminator == null || user.discriminator === "0") {
    return user.username;
  }

  return `${user.username}#${user.discriminator}`;
}

function buildTicketOpenedEmbed(user, reasonLabel = null, language = null) {
  const fields = [];
  const reason = (reasonLabel || "").trim();
  const langCode = normalizeLanguage(language || DEFAULT_LANGUAGE);
  const langName = getLanguageName(langCode);

  if (user) {
    const identityLines = [`- 🔖 Mention : <@${user.id}>`];

    if (user.globalName && user.globalName !== user.username) {
      identityLines.push(`- 🪪 Nom affiche : ${user.globalName}`);
    }

    identityLines.push(`- 🧩 Identifiant : \`${formatUserTag(user)}\``);

    const accountLines = [`- 🆔 ID : \`${user.id}\``];

    if (user.createdAt) {
      const createdAt = Math.floor(user.createdAt / 1000);
      accountLines.push(`- 📅 Cree le : <t:${createdAt}:F>`);
      accountLines.push(`- ⏳ Anciennete : <t:${createdAt}:R>`);
    }

    fields.push({
      name: "👤 Utilisateur",
      value: identityLines.join("\n"),
      inline: false,
    });

    fields.push({
      name: "🪪 Compte Discord",
      value: accountLines.join("\n"),
      inline: false,
    });
  } else {
    fields.push({
      name: "👤 Utilisateur",
      value: "Utilisateur inconnu",
      inline: false,
    });
  }

  if (ENABLE_LANGUAGE_SELECTION) {
    fields.push({
      name: "🗣️ Langue",
      value: `- ${langName} (${langCode.toUpperCase()})`,
      inline: true,
    });
  }

  if (reason) {
    const formattedReason = reason
      .split(/\r?\n/).map(line => (line ? `- ${line}` : "-")).join("\n");

    fields.push({
      name: "📝 Raison du ticket",
      value: formattedReason,
      inline: false,
    });
  }

  const embed = {
    title: config.ticketEmbedTitle || "🎟️ Nouveau ticket",
    description: user ? `Un ticket vient d'etre ouvert pour <@${user.id}>.` : "Un ticket vient d'etre ouvert.",
    color: 0x5865F2,
    fields,
    timestamp: new Date(),
  };

  if (user) {
    const avatarUrl = getUserAvatarURL(user);
    if (avatarUrl) {
      embed.thumbnail = { url: avatarUrl };
    }

    embed.footer = { text: `ID utilisateur : ${user.id}` };
  }

  return embed;
}

function getUserAvatarURL(user) {
  if (! user) return null;

  if (typeof user.dynamicAvatarURL === "function") {
    return user.dynamicAvatarURL("png", 256);
  }

  if (typeof user.avatarURL === "function") {
    return user.avatarURL("png", 256);
  }

  if (user.avatarURL) {
    return user.avatarURL;
  }

  if (user.avatar) {
    const extension = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=256`;
  }

  let fallbackIndex = 0;

  if (user.discriminator && user.discriminator !== "0") {
    fallbackIndex = Number(user.discriminator) % 5;
  } else {
    try {
      fallbackIndex = Number(BigInt(user.id) % 5n);
    } catch (err) {
      const id = typeof user.id === "string" ? user.id : `${user.id || 0}`;
      fallbackIndex = Number(id.slice(-1)) % 5;
    }
  }

  return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
}

async function installAllPlugins() {
  const plugins = getAllPlugins();
  await installPlugins(plugins);
}

async function loadAllPlugins() {
  // Initialize command manager
  const commands = createCommandManager(bot);

  // Register command aliases
  if (config.commandAliases) {
    for (const alias in config.commandAliases) {
      commands.addAlias(config.commandAliases[alias], alias);
    }
  }

  // Load plugins
  const basePlugins = getBasePlugins();
  const externalPlugins = getExternalPlugins();
  const plugins = getAllPlugins();

  const pluginApi = getPluginAPI({ bot, knex, config, commands });
  await loadPlugins([...basePlugins, ...externalPlugins], pluginApi);

  return {
    loadedCount: plugins.length,
    baseCount: basePlugins.length,
    externalCount: externalPlugins.length,
  };
}
