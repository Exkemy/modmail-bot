const moment = require("moment");
const Eris = require("eris");

const bot = require("../bot");
const knex = require("../knex");
const utils = require("../utils");
const config = require("../cfg");
const attachments = require("./attachments");
const { formatters } = require("../formatters");
const { callBeforeNewMessageReceivedHooks } = require("../hooks/beforeNewMessageReceived");
const { callAfterNewMessageReceivedHooks } = require("../hooks/afterNewMessageReceived");
const { callAfterThreadCloseHooks } = require("../hooks/afterThreadClose");
const { callAfterThreadCloseScheduledHooks } = require("../hooks/afterThreadCloseScheduled");
const { callAfterThreadCloseScheduleCanceledHooks } = require("../hooks/afterThreadCloseScheduleCanceled");
const snippets = require("./snippets");
const { getModeratorThreadDisplayRoleName } = require("./displayRoles");
const {
  translateText,
  normalizeLanguage,
  getLanguageName,
  getLanguageFlag,
  isSupportedLanguage,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} = require("../translation");

const ThreadMessage = require("./ThreadMessage");

const {THREAD_MESSAGE_TYPE, THREAD_STATUS, DISCORD_MESSAGE_ACTIVITY_TYPES} = require("./constants");
const {isBlocked} = require("./blocked");
const {messageContentToAdvancedMessageContent} = require("../utils");
const { saveLanguage } = require("./userProfiles");

const escapeFormattingRegex = new RegExp("[_`~*|]", "g");

/**
 * @property {String} id
 * @property {Number} thread_number
 * @property {Number} status
 * @property {String} user_id
 * @property {String} user_name
 * @property {String} channel_id
 * @property {Number} next_message_number
 * @property {String} scheduled_close_at
 * @property {String} scheduled_close_id
 * @property {String} scheduled_close_name
 * @property {Number} scheduled_close_silent
 * @property {String} alert_ids
 * @property {String} log_storage_type
 * @property {Object} log_storage_data
 * @property {String} created_at
 * @property {String} metadata
 */
class Thread {
  constructor(props) {
    utils.setDataModelProps(this, props);

    if (props.log_storage_data) {
      if (typeof props.log_storage_data === "string") {
        this.log_storage_data = JSON.parse(props.log_storage_data);
      }
    }

    if (props.metadata) {
      if (typeof props.metadata === "string") {
        this.metadata = JSON.parse(props.metadata);
      }
    }
  }

  getSQLProps() {
    return Object.entries(this).reduce((obj, [key, value]) => {
      if (typeof value === "function") return obj;
      if (typeof value === "object" && value != null) {
        obj[key] = JSON.stringify(value);
      } else {
        obj[key] = value;
      }
      return obj;
    }, {});
  }

  /**
   * @param {Eris.MessageContent} text
   * @param {Eris.MessageFile|Eris.MessageFile[]} file
   * @returns {Promise<Eris.Message>}
   * @throws Error
   * @private
   */
  async _sendDMToUser(content, file = null) {
    // Try to open a DM channel with the user
    const dmChannel = await this.getDMChannel();
    if (! dmChannel) {
      throw new Error("Impossible d'ouvrir les messages privés avec l'utilisateur. Il se peut qu'il ait bloqué le bot ou qu'il ait des paramètres de confidentialité plus stricts.");
    }

    return dmChannel.createMessage(content, file);
  }

  /**
   * @param {Eris.MessageContent} content
   * @param {Eris.MessageFile} file
   * @return {Promise<Eris.Message|null>}
   * @private
   */
  async _postToThreadChannel(content, file = null) {
    try {
      let firstMessage;

      const textContent = typeof content === "string" ? content : content.content;
      const contentObj = typeof content === "string" ? {} : content;
      if (textContent) {
        // Text content is included, chunk it and send it as individual messages.
        // Files (attachments) are only sent with the last message.
        const chunks = utils.chunkMessageLines(textContent);
        for (const [i, chunk] of chunks.entries()) {
          // Only send embeds, files, etc. with the last message
          const msg = (i === chunks.length - 1)
            ? await bot.createMessage(this.channel_id, { ...contentObj, content: chunk }, file)
            : await bot.createMessage(this.channel_id, { ...contentObj, content: chunk, embed: null });

          firstMessage = firstMessage || msg;
        }
      } else {
        // No text content, send as one message
        firstMessage = await bot.createMessage(this.channel_id, content, file);
      }

      return firstMessage;
    } catch (e) {
      // Channel not found
      if (e.code === 10003) {
        console.log(`[INFO] Échec de l'envoi du message sur le salon du fil pour ${this.user_name} car le salon n'existe plus. Fermeture automatique du fil.`);
        this.close(true);
      } else if (e.code === 240000) {
        console.log(`[INFO] Échec de l'envoi du message sur le salon du fil pour ${this.user_name} car le message contient un lien bloqué par le filtre de liens dangereux`);
        await bot.createMessage(this.channel_id, "Impossible d'envoyer le message sur le salon du fil car il contient un lien bloqué par le filtre de liens dangereux");
      } else {
        throw e;
      }
    }
  }

  /**
   * @param {Object} data
   * @returns {Promise<ThreadMessage>}
   * @private
   */
  async _addThreadMessageToDB(data) {
    if (data.message_type === THREAD_MESSAGE_TYPE.TO_USER) {
      data.message_number = await this._getAndIncrementNextMessageNumber();
    }

    const dmChannel = await this.getDMChannel();
    const insertedIds = await knex("thread_messages").insert({
      thread_id: this.id,
      created_at: moment.utc().format("YYYY-MM-DD HH:mm:ss"),
      is_anonymous: 0,
      dm_channel_id: dmChannel.id,
      ...data
    });

    const threadMessage = await knex("thread_messages")
      .where("id", insertedIds[0])
      .select();

    return new ThreadMessage(threadMessage[0]);
  }

  /**
   * @param {number} id
   * @param {object} data
   * @returns {Promise<void>}
   * @private
   */
  async _updateThreadMessage(id, data) {
    await knex("thread_messages")
      .where("id", id)
      .update(data);
  }

  /**
   * @param {number} id
   * @returns {Promise<void>}
   * @private
   */
  async _deleteThreadMessage(id) {
    await knex("thread_messages")
      .where("id", id)
      .delete();
  }

  /**
   * @returns {Promise<Number>}
   * @private
   */
  async _getAndIncrementNextMessageNumber() {
    return knex.transaction(async trx => {
      const nextNumberRow = await trx("threads")
        .where("id", this.id)
        .select("next_message_number")
        .first();
      const nextNumber = nextNumberRow.next_message_number;

      await trx("threads")
        .where("id", this.id)
        .update({ next_message_number: nextNumber + 1 });

      return nextNumber;
    });
  }

  /**
   * Adds the specified moderator to the thread's alert list after config.autoAlertDelay
   * @param {string} modId
   * @returns {Promise<void>}
   * @private
   */
  async _startAutoAlertTimer(modId) {
    clearTimeout(this._autoAlertTimeout);
    const autoAlertDelay = utils.convertDelayStringToMS(config.autoAlertDelay);
    this._autoAlertTimeout = setTimeout(() => {
      if (this.status !== THREAD_STATUS.OPEN) return;
      this.addAlert(modId);
    }, autoAlertDelay);
  }

  /**
   * @param {Eris.Member} moderator
   * @param {string} text
   * @param {Eris.MessageFile[]} replyAttachments
   * @param {boolean} isAnonymous
   * @param {Eris.MessageReference|null} messageReference
   * @returns {Promise<boolean>} Whether we were able to send the reply
   */
  async replyToUser(moderator, text, replyAttachments = [], isAnonymous = false, messageReference = null) {
    const regularName = config.useDisplaynames ? moderator.user.globalName || moderator.user.username : moderator.user.username;
    let moderatorName = config.useNicknames && moderator.nick ? moderator.nick : regularName;
    if (config.breakFormattingForNames) {
      moderatorName = moderatorName.replace(escapeFormattingRegex, "\\$&");
    }

    const roleName = await getModeratorThreadDisplayRoleName(moderator, this.id);
    /** @var {Eris.MessageReference|null} userMessageReference */
    let userMessageReference = null;

    // Handle replies
    if (config.relayInlineReplies && messageReference) {
      const repliedTo = await this.getThreadMessageForMessageId(messageReference.messageID);
      if (repliedTo) {
        userMessageReference = {
          channelID: repliedTo.dm_channel_id,
          messageID: repliedTo.dm_message_id,
        };
      }
    }

    if (config.allowSnippets && config.allowInlineSnippets) {
      // Replace {{snippet}} with the corresponding snippet
      // The beginning and end of the variable - {{ and }} - can be changed with the config options
      // config.inlineSnippetStart and config.inlineSnippetEnd
      const allSnippets = await snippets.all();
      const snippetMap = allSnippets.reduce((_map, snippet) => {
        _map[snippet.trigger.toLowerCase()] = snippet;
        return _map;
      }, {});

      let unknownSnippets = new Set();
      text = text.replace(
        new RegExp(`${config.inlineSnippetStart}(\\s*\\S+?\\s*)${config.inlineSnippetEnd}`, "ig"),
        (orig, trigger) => {
          trigger = trigger.trim();
          const snippet = snippetMap[trigger.toLowerCase()];
          if (snippet == null) {
            unknownSnippets.add(trigger);
          }

          return snippet != null ? snippet.body : orig;
        }
      );

      if (config.errorOnUnknownInlineSnippet && unknownSnippets.size > 0) {
        this.postSystemMessage(`Les extraits suivants utilisés dans la réponse n'existent pas :\n${Array.from(unknownSnippets).join(", ")}`);
        return false;
      }
    }

    const targetLanguage = normalizeLanguage(this.getMetadataValue("ticketLanguage") || DEFAULT_LANGUAGE);
    let translatedForUser = null;

    if (text && targetLanguage !== "fr") {
      translatedForUser = await translateText(text, targetLanguage, "fr");
      if (! translatedForUser) {
        console.warn(`[translation] Echec traduction vers ${targetLanguage} pour le message staff -> utilisateur`);
      }
    }

    const outboundText = translatedForUser || text;

    // Prepare attachments, if any
    const files = [];
    const attachmentLinks = [];

    if (replyAttachments.length > 0) {
      for (const attachment of replyAttachments) {
        await Promise.all([
          attachments.attachmentToDiscordFileObject(attachment).then(file => {
            files.push(file);
          }),
          attachments.saveAttachment(attachment).then(result => {
            attachmentLinks.push(result.url);
          })
        ]);
      }
    }

    const rawThreadMessage = new ThreadMessage({
      message_type: THREAD_MESSAGE_TYPE.TO_USER,
      user_id: moderator.id,
      user_name: moderatorName,
      body: text,
      is_anonymous: (isAnonymous ? 1 : 0),
      role_name: roleName,
      attachments: attachmentLinks,
    });
    const threadMessage = await this._addThreadMessageToDB(rawThreadMessage.getSQLProps());

    const dmThreadMessage = threadMessage.clone();
    const frFlag = getLanguageFlag("fr");
    const targetFlag = getLanguageFlag(targetLanguage);

    if (translatedForUser) {
      dmThreadMessage.body = `${targetFlag} ${outboundText}`;
    } else if (targetLanguage !== "fr") {
      dmThreadMessage.body = `${targetFlag} ${text}`;
    } else {
      dmThreadMessage.body = `${frFlag} ${text}`;
    }

    const dmContent = messageContentToAdvancedMessageContent(await formatters.formatStaffReplyDM(dmThreadMessage));
    if (userMessageReference) {
      dmContent.messageReference = {
        ...userMessageReference,
        failIfNotExists: false,
      };
    }

    const inboxThreadMessage = threadMessage.clone();
    if (translatedForUser && targetLanguage !== "fr") {
      inboxThreadMessage.body = `${frFlag} ${text}\n${targetFlag} ${outboundText}`;
    } else if (targetLanguage !== "fr") {
      // Pas de traduction, on montre juste le texte original avec son drapeau
      inboxThreadMessage.body = `${frFlag} ${text}`;
    } else {
      inboxThreadMessage.body = `${frFlag} ${text}`;
    }

    let inboxContent;

    if (config.ticketEmbed !== false) {
      // === MODE EMBED ===
      const embedRoleName = config.overrideRoleNameDisplay || inboxThreadMessage.role_name || config.fallbackRoleName;
      const modDisplayName = inboxThreadMessage.is_anonymous
        ? (embedRoleName ? `(Anonyme) ${embedRoleName}` : "(Anonyme)")
        : (embedRoleName ? `(${embedRoleName}) ${inboxThreadMessage.user_name}` : inboxThreadMessage.user_name);

      const staffEmbed = {
        author: { name: modDisplayName },
        description: inboxThreadMessage.body || undefined,
        color: 0x5865F2,
        timestamp: new Date().toISOString(),
      };

      // Add attachment links to embed description
      if (attachmentLinks.length > 0) {
        staffEmbed.description = (staffEmbed.description || "") + "\n\n" + attachmentLinks.map(link => `📎 ${link}`).join("\n");
      }

      if (config.threadTimestamps) {
        const formattedTimestamp = utils.getTimestamp(threadMessage.created_at);
        staffEmbed.footer = { text: formattedTimestamp };
      }

      inboxContent = { embeds: [staffEmbed] };
    } else {
      // === MODE MESSAGE CLASSIQUE ===
      inboxContent = messageContentToAdvancedMessageContent(await formatters.formatStaffReplyThreadMessage(inboxThreadMessage));
    }

    if (messageReference) {
      inboxContent.messageReference = {
        channelID: messageReference.channelID,
        messageID: messageReference.messageID,
        failIfNotExists: false,
      };
    }

    // Because moderator replies have to be editable, we enforce them to fit within 1 message
    if (! utils.messageContentIsWithinMaxLength(dmContent) || ! utils.messageContentIsWithinMaxLength(inboxContent)) {
      await this._deleteThreadMessage(threadMessage.id);
      await this.postSystemMessage("La réponse est trop longue ! Assurez-vous que votre réponse fasse moins de 2000 caractères au total, nom du modérateur compris.");
      return false;
    }

    // Send the reply DM
    let dmMessage;
    try {
      dmMessage = await this._sendDMToUser(dmContent, files);
    } catch (e) {
      await this._deleteThreadMessage(threadMessage.id);
      await this.postSystemMessage(`Erreur lors de la réponse à l'utilisateur : ${e.message}`);
      return false;
    }

    // Special case: "original" attachments
    if (config.attachmentStorage === "original") {
      threadMessage.attachments = dmMessage.attachments.map(att => att.url);
    }

    threadMessage.dm_message_id = dmMessage.id;
    await this._updateThreadMessage(threadMessage.id, threadMessage.getSQLProps());

    // Show the reply in the inbox thread
    const inboxMessage = await this._postToThreadChannel(inboxContent, files);
    if (inboxMessage) {
      threadMessage.inbox_message_id = inboxMessage.id;
      await this._updateThreadMessage(threadMessage.id, { inbox_message_id: inboxMessage.id });
    }

    // Interrupt scheduled closing, if in progress
    if (this.scheduled_close_at) {
      await this.cancelScheduledClose();
      await this.postSystemMessage("Annulation de la fermeture planifiée de ce fil en raison d'une nouvelle réponse");
    }

    // If enabled, set up a reply alert for the moderator after a slight delay
    if (config.autoAlert) {
      this._startAutoAlertTimer(moderator.id);
    }

    return true;
  }

  /**
   * @param {Eris.Message} msg
   * @returns {Promise<void>}
   */
  async receiveUserReply(msg, skipAlert = false) {
    const user = msg.author;
    const opts = {
      thread: this,
      message: msg,
    };
    let hookResult;

    // Call any registered beforeNewMessageReceivedHooks
    hookResult = await callBeforeNewMessageReceivedHooks({
      user,
      opts,
      message: opts.message
    });
    if (hookResult.cancelled) return;

    let messageContent = msg.content || "";

    // Prepare attachments
    const attachmentLinks = [];
    const smallAttachmentLinks = [];
    const attachmentFiles = [];
    const imageAttachmentLinks = [];

    const _imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

    for (const attachment of msg.attachments) {
      const savedAttachment = await attachments.saveAttachment(attachment);

      // Forward small attachments (<2MB) as attachments, link to larger ones
      if (config.relaySmallAttachmentsAsAttachments && attachment.size <= config.smallAttachmentLimit) {
        const file = await attachments.attachmentToDiscordFileObject(attachment);
        attachmentFiles.push(file);
        smallAttachmentLinks.push(savedAttachment.url);
      }

      attachmentLinks.push(savedAttachment.url);

      // Track image attachments for inline display in embed
      const isImage = (attachment.content_type && attachment.content_type.startsWith("image/"))
        || (attachment.filename && _imageExtensions.some(ext => attachment.filename.toLowerCase().endsWith(ext)));
      if (isImage) {
        imageAttachmentLinks.push(savedAttachment.url);
      }
    }

    // Handle inline replies
    /** @var {Eris.MessageReference|null} messageReference */
    let messageReference = null;
    if (config.relayInlineReplies && msg.referencedMessage) {
      const repliedTo = await this.getThreadMessageForMessageId(msg.referencedMessage.id);
      if (repliedTo) {
        messageReference = {
          channelID: this.channel_id,
          messageID: repliedTo.inbox_message_id,
        };
      }
    }

    // Handle special embeds (listening party invites etc.)
    if (msg.activity) {
      let applicationName = msg.application && msg.application.name;

      if (! applicationName && msg.activity.party_id.startsWith("spotify:")) {
        applicationName = "Spotify";
      }

      if (! applicationName) {
        applicationName = "Application inconnue";
      }

      let activityText;
      if (msg.activity.type === DISCORD_MESSAGE_ACTIVITY_TYPES.JOIN || msg.activity.type === DISCORD_MESSAGE_ACTIVITY_TYPES.JOIN_REQUEST) {
        activityText = "rejoindre une partie";
      } else if (msg.activity.type === DISCORD_MESSAGE_ACTIVITY_TYPES.SPECTATE) {
        activityText = "regarder";
      } else if (msg.activity.type === DISCORD_MESSAGE_ACTIVITY_TYPES.LISTEN) {
        activityText = "écouter ensemble";
      } else {
        activityText = "faire quelque chose";
      }

      messageContent += `\n\n*<Ce message contient une invitation à ${activityText} sur ${applicationName}>*`;
      messageContent = messageContent.trim();
    }

    if (msg.stickerItems && msg.stickerItems.length) {
      const stickerLines = msg.stickerItems.map(sticker => {
        return `*Autocollant envoyé "${sticker.name}":* https://media.discordapp.net/stickers/${sticker.id}.webp?size=160`
      })

      messageContent += "\n\n" + stickerLines.join("\n");
    }

    messageContent = messageContent.trim();

    const languageCommandMatch = messageContent.match(/^!lang(?:uage)?\s+([a-z]{2})\s*$/i);
    if (languageCommandMatch) {
      const requestedLanguage = languageCommandMatch[1].toLowerCase();

      if (! isSupportedLanguage(requestedLanguage)) {
        await this._sendDMToUser({
          content: `Langue inconnue. Langues disponibles : ${SUPPORTED_LANGUAGES.join(", ")}.`,
        }).catch(utils.noop);
        return;
      }

      const normalizedLanguage = normalizeLanguage(requestedLanguage);
      const currentLanguage = normalizeLanguage(this.getMetadataValue("ticketLanguage") || DEFAULT_LANGUAGE);

      if (normalizedLanguage === currentLanguage) {
        await this._sendDMToUser({
          content: `La langue est deja definie sur ${getLanguageFlag(currentLanguage)} ${getLanguageName(currentLanguage)}.`,
        }).catch(utils.noop);
        return;
      }

      await this.setMetadataValue("ticketLanguage", normalizedLanguage);

      try {
        await saveLanguage(this.user_id, normalizedLanguage);
      } catch (err) {
        console.error(`[WARN] Impossible d'enregistrer la langue pour ${this.user_id} : ${err.message || err}`);
      }

      await this.postSystemMessage(`Langue du ticket mise a jour -> ${getLanguageFlag(normalizedLanguage)} ${getLanguageName(normalizedLanguage)}`);

      await this._sendDMToUser({
        content: `Langue mise a jour sur ${getLanguageFlag(normalizedLanguage)} ${getLanguageName(normalizedLanguage)}.`,
      }).catch(utils.noop);

      return;
    }

    const userLanguage = normalizeLanguage(this.getMetadataValue("ticketLanguage") || DEFAULT_LANGUAGE);
    let translatedForStaff = null;
    if (messageContent && userLanguage !== "fr") {
      translatedForStaff = await translateText(messageContent, "fr", userLanguage);
      if (! translatedForStaff) {
        console.warn(`[translation] Echec traduction vers fr pour message utilisateur -> staff (langue utilisateur ${userLanguage})`);
      }
    }

    // Save DB entry
    let threadMessage = new ThreadMessage({
      message_type: THREAD_MESSAGE_TYPE.FROM_USER,
      user_id: this.user_id,
      user_name: config.useDisplaynames ? msg.author.globalName || msg.author.username : msg.author.username,
      body: messageContent,
      is_anonymous: 0,
      dm_message_id: msg.id,
      dm_channel_id: msg.channel.id,
      attachments: attachmentLinks,
      small_attachments: smallAttachmentLinks,
    });

    threadMessage = await this._addThreadMessageToDB(threadMessage.getSQLProps());

    // Show user reply in the inbox thread
    const inboxDisplayMessage = threadMessage.clone();
    if (translatedForStaff) {
      inboxDisplayMessage.body = `${getLanguageFlag(userLanguage)} ${messageContent}\n\n${getLanguageFlag("fr")} ${translatedForStaff}`;
    } else {
      inboxDisplayMessage.body = `${getLanguageFlag(userLanguage)} ${messageContent}`;
    }

    let inboxContent;

    if (config.ticketEmbed !== false) {
      // === MODE EMBED ===
      const userAvatarURL = (typeof msg.author.dynamicAvatarURL === "function")
        ? msg.author.dynamicAvatarURL("png", 256)
        : (msg.author.avatarURL || null);

      const embed = {
        author: {
          name: inboxDisplayMessage.user_name,
          icon_url: userAvatarURL,
        },
        description: inboxDisplayMessage.body || undefined,
        color: 0x2ECC71,
        timestamp: new Date().toISOString(),
      };

      // Display the first image directly in the embed
      if (imageAttachmentLinks.length > 0) {
        embed.image = { url: imageAttachmentLinks[0] };
      }

      // Add non-image attachment links to description
      const nonImageLinks = attachmentLinks.filter(link => ! imageAttachmentLinks.includes(link));
      if (nonImageLinks.length > 0) {
        embed.description = (embed.description || "") + "\n\n" + nonImageLinks.map(link => `📎 ${link}`).join("\n");
      }

      // Add extra image links (2nd, 3rd, etc.) as text links in description
      if (imageAttachmentLinks.length > 1) {
        const extraImages = imageAttachmentLinks.slice(1).map(link => `🖼️ ${link}`).join("\n");
        embed.description = (embed.description || "") + "\n\n" + extraImages;
      }

      if (config.threadTimestamps) {
        const formattedTimestamp = utils.getTimestamp(threadMessage.created_at);
        embed.footer = { text: formattedTimestamp };
      }

      inboxContent = { embeds: [embed] };
    } else {
      // === MODE MESSAGE CLASSIQUE ===
      inboxContent = messageContentToAdvancedMessageContent(await formatters.formatUserReplyThreadMessage(inboxDisplayMessage));
    }

    if (messageReference) {
      inboxContent.messageReference = {
        channelID: messageReference.channelID,
        messageID: messageReference.messageID,
        failIfNotExists: false,
      };
    }
    const inboxMessage = await this._postToThreadChannel(inboxContent, attachmentFiles);
    if (inboxMessage) {
      await this._updateThreadMessage(threadMessage.id, { inbox_message_id: inboxMessage.id });
    }

    if (config.reactOnSeen) {
      await msg.addReaction(config.reactOnSeenEmoji).catch(utils.noop);
    }

    // Call any registered afterNewMessageReceivedHooks
    await callAfterNewMessageReceivedHooks({
      user,
      opts,
      message: opts.message
    });

    // Interrupt scheduled closing, if in progress
    if (this.scheduled_close_at) {
      await this.cancelScheduledClose();
      await this.postSystemMessage(`<@!${this.scheduled_close_id}> Le fil dont la fermeture était planifiée a reçu une nouvelle réponse. Annulation.`, {
        allowedMentions: {
          users: [this.scheduled_close_id],
        },
      });
    }

    if (this.alert_ids && ! skipAlert) {
      const ids = this.alert_ids.split(",");
      const mentionsStr = ids.map(id => `<@!${id}> `).join("");

      await this.deleteAlerts();
      await this.postSystemMessage(`${mentionsStr}Nouveau message de ${this.user_name}`, {
        allowedMentions: {
          users: ids,
        },
      });
    }
  }

  /**
   * @returns {Promise<PrivateChannel>}
   */
  getDMChannel() {
    return bot.getDMChannel(this.user_id);
  }

  /**
   * @param {string} text
   * @param {object} opts
   * @param {object} [opts.allowedMentions] Allowed mentions for the thread channel message
   * @param {boolean} [opts.allowedMentions.everyone]
   * @param {boolean|string[]} [opts.allowedMentions.roles]
   * @param {boolean|string[]} [opts.allowedMentions.users]
   * @param {Eris.MessageReference} [opts.messageReference]
   * @returns {Promise<void>}
   */
  async postSystemMessage(text, opts = {}) {
    const threadMessage = new ThreadMessage({
      message_type: THREAD_MESSAGE_TYPE.SYSTEM,
      user_id: null,
      user_name: "",
      body: text,
      is_anonymous: 0,
    });

    let content;

    if (config.ticketEmbed !== false) {
      // === MODE EMBED ===
      const systemEmbed = {
        description: text,
        color: 0x95A5A6,
        timestamp: new Date().toISOString(),
      };
      content = { embeds: [systemEmbed] };
    } else {
      // === MODE MESSAGE CLASSIQUE ===
      content = messageContentToAdvancedMessageContent(await formatters.formatSystemThreadMessage(threadMessage));
    }

    content.allowedMentions = opts.allowedMentions;
    if (opts.messageReference) {
      content.messageReference = {
        ...opts.messageReference,
        failIfNotExists: false,
      };
    }
    const msg = await this._postToThreadChannel(content);

    threadMessage.inbox_message_id = msg.id;
    const finalThreadMessage = await this._addThreadMessageToDB(threadMessage.getSQLProps());

    return {
      message: msg,
      threadMessage: finalThreadMessage,
    };
  }

  /**
   * @param {string} text
   * @returns {Promise<ThreadMessage>}
   */
  async addSystemMessageToLogs(text) {
    const threadMessage = new ThreadMessage({
      message_type: THREAD_MESSAGE_TYPE.SYSTEM,
      user_id: null,
      user_name: "",
      body: text,
      is_anonymous: 0,
    });
    return this._addThreadMessageToDB(threadMessage.getSQLProps());
  }

  /**
   * @param {string} text
   * @param {object} opts
   * @param {object} [allowedMentions] Allowed mentions for the thread channel message
   * @param {boolean} [allowedMentions.everyone]
   * @param {boolean|string[]} [allowedMentions.roles]
   * @param {boolean|string[]} [allowedMentions.users]
   * @param {boolean} [allowedMentions.postToThreadChannel]
   * @returns {Promise<void>}
   */
  async sendSystemMessageToUser(text, opts = {}) {
    const targetLanguage = normalizeLanguage(this.getMetadataValue("ticketLanguage") || DEFAULT_LANGUAGE);
    let translated = null;

    if (typeof text === "string" && text.trim() && targetLanguage !== "fr") {
      translated = await translateText(text, targetLanguage, "fr");
      if (! translated) {
        console.warn(`[translation] Echec traduction system -> utilisateur vers ${targetLanguage}`);
      }
    }

    const dmBody = translated || text;

    const threadMessage = new ThreadMessage({
      message_type: THREAD_MESSAGE_TYPE.SYSTEM_TO_USER,
      user_id: null,
      user_name: "",
      body: dmBody,
      is_anonymous: 0,
    });

    const dmContent = await formatters.formatSystemToUserDM(threadMessage);
    const dmMsg = await this._sendDMToUser(dmContent);

    if (opts.postToThreadChannel !== false) {
      const inboxThreadMessage = translated && targetLanguage !== "fr"
        ? new ThreadMessage({
            ...threadMessage.getSQLProps(),
            body: `${text}\n\n${getLanguageFlag(targetLanguage)} ${dmBody}`,
          })
        : (targetLanguage !== "fr"
            ? new ThreadMessage({
                ...threadMessage.getSQLProps(),
                body: `${getLanguageFlag(targetLanguage)} ${text}`,
              })
            : threadMessage);

      let finalInboxContent;

      if (config.ticketEmbed !== false) {
        // === MODE EMBED ===
        const sysEmbed = {
          author: { name: `⚙️ ${bot.user.username}` },
          description: inboxThreadMessage.body || undefined,
          color: 0xF39C12,
          timestamp: new Date().toISOString(),
        };
        finalInboxContent = { embeds: [sysEmbed] };
      } else {
        // === MODE MESSAGE CLASSIQUE ===
        const inboxContent = await formatters.formatSystemToUserThreadMessage(inboxThreadMessage);
        finalInboxContent = typeof inboxContent === "string" ? {content: inboxContent} : inboxContent;
      }

      finalInboxContent.allowedMentions = opts.allowedMentions;
      const inboxMsg = await this._postToThreadChannel(finalInboxContent);
      threadMessage.inbox_message_id = inboxMsg.id;
    }

    threadMessage.dm_channel_id = dmMsg.channel.id;
    threadMessage.dm_message_id = dmMsg.id;

    await this._addThreadMessageToDB(threadMessage.getSQLProps());
  }

  /**
   * @param {Eris.MessageContent} content
   * @param {Eris.MessageFile} file
   * @return {Promise<Eris.Message|null>}
   */
  async postNonLogMessage(content, file = null) {
    return this._postToThreadChannel(content, file);
  }

  /**
   * @param {Eris.Message} msg
   * @returns {Promise<void>}
   */
  async saveChatMessageToLogs(msg) {
    // TODO: Save attachments?
    return this._addThreadMessageToDB({
      message_type: THREAD_MESSAGE_TYPE.CHAT,
      user_id: msg.author.id,
      user_name: config.useDisplaynames ? msg.author.globalName || msg.author.username : msg.author.username,
      body: msg.content,
      is_anonymous: 0,
      dm_message_id: msg.id
    });
  }

  async saveCommandMessageToLogs(msg) {
    return this._addThreadMessageToDB({
      message_type: THREAD_MESSAGE_TYPE.COMMAND,
      user_id: msg.author.id,
      user_name: config.useDisplaynames ? msg.author.globalName || msg.author.username : msg.author.username,
      body: msg.content,
      is_anonymous: 0,
      dm_message_id: msg.id
    });
  }

  /**
   * @param {Eris.Message} msg
   * @returns {Promise<void>}
   */
  async updateChatMessageInLogs(msg) {
    await knex("thread_messages")
      .where("thread_id", this.id)
      .where("dm_message_id", msg.id)
      .update({
        body: msg.content
      });
  }

  /**
   * @param {String} messageId
   * @returns {Promise<void>}
   */
  async deleteChatMessageFromLogs(messageId) {
    await knex("thread_messages")
      .where("thread_id", this.id)
      .where("dm_message_id", messageId)
      .delete();
  }

  /**
   * @returns {Promise<ThreadMessage[]>}
   */
  async getThreadMessages() {
    const threadMessages = await knex("thread_messages")
      .where("thread_id", this.id)
      .orderBy("created_at", "ASC")
      .orderBy("id", "ASC")
      .select();

    return threadMessages.map(row => new ThreadMessage(row));
  }

  /**
   * @param {string} messageId
   * @returns {Promise<ThreadMessage|null>}
   */
  async getThreadMessageForMessageId(messageId) {
    const data = await knex("thread_messages")
      .where(function() {
        this.where("dm_message_id", messageId)
        this.orWhere("inbox_message_id", messageId)
      })
      .andWhere("thread_id", this.id)
      .first();

    return (data ? new ThreadMessage(data) : null);
  }

  async findThreadMessageByDmMessageId(messageId) {
    const data = await knex("thread_messages")
      .where("thread_id", this.id)
      .where("dm_message_id", messageId)
      .first();

    return data ? new ThreadMessage(data) : null;
  }

  /**
   * @returns {Promise<ThreadMessage>}
   */
  async getLatestThreadMessage() {
    const threadMessage = await knex("thread_messages")
      .where("thread_id", this.id)
      .andWhere(function() {
        this.where("message_type", THREAD_MESSAGE_TYPE.FROM_USER)
          .orWhere("message_type", THREAD_MESSAGE_TYPE.TO_USER)
          .orWhere("message_type", THREAD_MESSAGE_TYPE.SYSTEM_TO_USER)
      })
      .orderBy("created_at", "DESC")
      .orderBy("id", "DESC")
      .first();

      return threadMessage;
  }

  /**
   * @param {number} messageNumber
   * @returns {Promise<ThreadMessage>}
   */
  async findThreadMessageByMessageNumber(messageNumber) {
    const data = await knex("thread_messages")
      .where("thread_id", this.id)
      .where("message_number", messageNumber)
      .first();

    return data ? new ThreadMessage(data) : null;
  }

  /**
   * @returns {Promise<void>}
   */
  async close(suppressSystemMessage = false, silent = false) {
    if (! suppressSystemMessage) {
      console.log(`Fermeture du fil ${this.id}`);

      if (silent) {
        await this.postSystemMessage("Fermeture silencieuse du fil...");
      } else {
        await this.postSystemMessage("Fermeture du fil...");
      }
    }

    // Update DB status
    this.status = THREAD_STATUS.CLOSED;
    await knex("threads")
      .where("id", this.id)
      .update({
        status: THREAD_STATUS.CLOSED
      });

    // Delete channel
    const channel = bot.getChannel(this.channel_id);
    if (channel) {
      console.log(`Suppression du salon ${this.channel_id}`);
      await channel.delete("Fil fermé");
    }

    await callAfterThreadCloseHooks({ threadId: this.id });
  }

  /**
   * @param {String} time
   * @param {Eris~User} user
   * @param {Number} silent
   * @returns {Promise<void>}
   */
  async scheduleClose(time, user, silent) {
    await knex("threads")
      .where("id", this.id)
      .update({
        scheduled_close_at: time,
        scheduled_close_id: user.id,
        scheduled_close_name: config.useDisplaynames ? user.globalName || user.username : user.username,
        scheduled_close_silent: silent
      });

    await callAfterThreadCloseScheduledHooks({ thread: this });
  }

  /**
   * @returns {Promise<void>}
   */
  async cancelScheduledClose() {
    await knex("threads")
      .where("id", this.id)
      .update({
        scheduled_close_at: null,
        scheduled_close_id: null,
        scheduled_close_name: null,
        scheduled_close_silent: null
      });

    await callAfterThreadCloseScheduleCanceledHooks({ thread: this });
  }

  /**
   * @returns {Promise<void>}
   */
  async suspend() {
    await knex("threads")
      .where("id", this.id)
      .update({
        status: THREAD_STATUS.SUSPENDED,
        scheduled_suspend_at: null,
        scheduled_suspend_id: null,
        scheduled_suspend_name: null
      });
  }

  /**
   * @returns {Promise<void>}
   */
  async unsuspend() {
    await knex("threads")
      .where("id", this.id)
      .update({
        status: THREAD_STATUS.OPEN
      });
  }

  /**
   * @param {String} time
   * @param {Eris~User} user
   * @returns {Promise<void>}
   */
  async scheduleSuspend(time, user) {
    await knex("threads")
      .where("id", this.id)
      .update({
        scheduled_suspend_at: time,
        scheduled_suspend_id: user.id,
        scheduled_suspend_name: config.useDisplaynames ? user.globalName || user.username : user.username,
      });
  }

  /**
   * @returns {Promise<void>}
   */
  async cancelScheduledSuspend() {
    await knex("threads")
      .where("id", this.id)
      .update({
        scheduled_suspend_at: null,
        scheduled_suspend_id: null,
        scheduled_suspend_name: null
      });
  }

  /**
   * @param {String} userId
   * @returns {Promise<void>}
   */
  async addAlert(userId) {
    let alerts = await knex("threads")
      .where("id", this.id)
      .select("alert_ids")
      .first();
    alerts = alerts.alert_ids;

    if (alerts == null) {
      alerts = [userId]
    } else {
      alerts = alerts.split(",");
      if (! alerts.includes(userId)) {
        alerts.push(userId);
      }
    }

    alerts = alerts.join(",");
    await knex("threads")
      .where("id", this.id)
      .update({
        alert_ids: alerts
      });
  }

  /*
   * @param {String} userId
   * @returns {Promise<void>}
   */
  async removeAlert(userId) {
    let alerts = await knex("threads")
      .where("id", this.id)
      .select("alert_ids")
      .first();
    alerts = alerts.alert_ids;

    if (alerts != null) {
      alerts = alerts.split(",");

      for (let i = 0; i < alerts.length; i++) {
        if (alerts[i] === userId) {
          alerts.splice(i, 1);
        }
      }
    } else {
      return;
    }

    if (alerts.length === 0) {
      alerts = null;
    } else {
      alerts = alerts.join(",");
    }

    await knex("threads")
      .where("id", this.id)
      .update({
        alert_ids: alerts
      });
  }

  /**
   * @returns {Promise<void>}
   */
  async deleteAlerts() {
    await knex("threads")
      .where("id", this.id)
      .update({
        alert_ids: null
      })
  }

  /**
   * @param {Eris.Member} moderator
   * @param {ThreadMessage} threadMessage
   * @param {string} newText
   * @param {object} opts
   * @param {boolean} opts.quiet Whether to suppress edit notifications in the thread channel
   * @returns {Promise<void>}
   */
  async editStaffReply(moderator, threadMessage, newText, opts = {}) {
    const newThreadMessage = new ThreadMessage({
      ...threadMessage.getSQLProps(),
      body: newText,
    });

    const formattedDM = await formatters.formatStaffReplyDM(newThreadMessage);

    // Same restriction as in replies. Because edits could theoretically change the number of messages a reply takes, we enforce replies
    // to fit within 1 message to avoid the headache and issues caused by that.
    if (! utils.messageContentIsWithinMaxLength(formattedDM)) {
      await this.postSystemMessage("La réponse modifiée est trop longue ! Assurez-vous que la modification fasse moins de 2000 caractères au total, nom du modérateur compris.");
      return false;
    }

    await bot.editMessage(threadMessage.dm_channel_id, threadMessage.dm_message_id, formattedDM);

    if (config.ticketEmbed !== false) {
      // === MODE EMBED ===
      const embedRoleName = config.overrideRoleNameDisplay || newThreadMessage.role_name || config.fallbackRoleName;
      const modDisplayName = newThreadMessage.is_anonymous
        ? (embedRoleName ? `(Anonyme) ${embedRoleName}` : "(Anonyme)")
        : (embedRoleName ? `(${embedRoleName}) ${newThreadMessage.user_name}` : newThreadMessage.user_name);

      const staffEmbed = {
        author: { name: modDisplayName },
        description: newText,
        color: 0x5865F2,
        timestamp: new Date().toISOString(),
      };

      if (config.threadTimestamps) {
        const formattedTimestamp = utils.getTimestamp(newThreadMessage.created_at);
        staffEmbed.footer = { text: formattedTimestamp };
      }

      await bot.editMessage(this.channel_id, threadMessage.inbox_message_id, { embeds: [staffEmbed] });
    } else {
      // === MODE MESSAGE CLASSIQUE ===
      const formattedThreadMessage = await formatters.formatStaffReplyThreadMessage(newThreadMessage);
      await bot.editMessage(this.channel_id, threadMessage.inbox_message_id, formattedThreadMessage);
    }

    if (! opts.quiet) {
      const editThreadMessage = new ThreadMessage({
        message_type: THREAD_MESSAGE_TYPE.REPLY_EDITED,
        user_id: null,
        user_name: "",
        body: "",
        is_anonymous: 0,
      });
      editThreadMessage.setMetadataValue("originalThreadMessage", threadMessage);
      editThreadMessage.setMetadataValue("newBody", newText);

      const threadNotification = await formatters.formatStaffReplyEditNotificationThreadMessage(editThreadMessage);
      const inboxMessage = await this._postToThreadChannel(threadNotification);
      editThreadMessage.inbox_message_id = inboxMessage.id;
      await this._addThreadMessageToDB(editThreadMessage.getSQLProps());
    }

    await this._updateThreadMessage(threadMessage.id, { body: newText });
    return true;
  }

  /**
   * @param {Eris.Member} moderator
   * @param {ThreadMessage} threadMessage
   * @param {object} opts
   * @param {boolean} opts.quiet Whether to suppress edit notifications in the thread channel
   * @returns {Promise<void>}
   */
  async deleteStaffReply(moderator, threadMessage, opts = {}) {
    await bot.deleteMessage(threadMessage.dm_channel_id, threadMessage.dm_message_id);
    await bot.deleteMessage(this.channel_id, threadMessage.inbox_message_id);

    if (! opts.quiet) {
      const deletionThreadMessage = new ThreadMessage({
        message_type: THREAD_MESSAGE_TYPE.REPLY_DELETED,
        user_id: null,
        user_name: "",
        body: "",
        is_anonymous: 0,
      });
      deletionThreadMessage.setMetadataValue("originalThreadMessage", threadMessage);

      const threadNotification = await formatters.formatStaffReplyDeletionNotificationThreadMessage(deletionThreadMessage);
      const inboxMessage = await this._postToThreadChannel(threadNotification);
      deletionThreadMessage.inbox_message_id = inboxMessage.id;
      await this._addThreadMessageToDB(deletionThreadMessage.getSQLProps());
    }

    await this._deleteThreadMessage(threadMessage.id);
  }

  /**
   * @param {String} storageType
   * @param {Object|null} storageData
   * @returns {Promise<void>}
   */
  async updateLogStorageValues(storageType, storageData) {
    this.log_storage_type = storageType;
    this.log_storage_data = storageData;

    const { log_storage_type, log_storage_data } = this.getSQLProps();

    await knex("threads")
      .where("id", this.id)
      .update({
        log_storage_type,
        log_storage_data,
      });
  }

  /**
   * @param {string} key
   * @param {*} value
   * @return {Promise<void>}
   */
  async setMetadataValue(key, value) {
    this.metadata = this.metadata || {};
    this.metadata[key] = value;

    await knex("threads")
      .where("id", this.id)
      .update({
        metadata: this.getSQLProps().metadata,
      });
  }

  /**
   * @param {string} key
   * @returns {*}
   */
  getMetadataValue(key) {
    return this.metadata ? this.metadata[key] : null;
  }

  /**
   * @returns {boolean}
   */
  isOpen() {
    return this.status === THREAD_STATUS.OPEN;
  }

  isClosed() {
    return this.status === THREAD_STATUS.CLOSED;
  }

  /**
   * Requests messages sent after last correspondence from Discord API to recover messages lost to downtime
   */
  async recoverDowntimeMessages() {
    if (await isBlocked(this.user_id)) return;

    const dmChannel = await bot.getDMChannel(this.user_id);
    if (! dmChannel) return;

    const lastMessageId = (await this.getLatestThreadMessage()).dm_message_id;
    let messages = (await dmChannel.getMessages(50, null, lastMessageId, null))
      .reverse() // We reverse the array to send the messages in the proper order - Discord returns them newest to oldest
      .filter(msg => msg.author.id === this.user_id); // Make sure we're not recovering bot or system messages

    if (messages.length === 0) return;

    await this.postSystemMessage(`📥 Récupération de ${messages.length} message(s) envoyés par l'utilisateur pendant l'indisponibilité du bot !`);

    let isFirst = true;
    for (const msg of messages) {
      await this.receiveUserReply(msg, ! isFirst);
      isFirst = false;
    }
  }
}

module.exports = Thread;
