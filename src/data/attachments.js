const Eris = require("eris");
const fs = require("fs");
const https = require("https");
const {promisify} = require("util");
const tmp = require("tmp");
const config = require("../cfg");
const utils = require("../utils");
const mv = promisify(require("mv"));
const path = require("path");

const getUtils = () => require("../utils");

const access = promisify(fs.access);
const readFile = promisify(fs.readFile);

const localAttachmentDir = config.attachmentDir || `${__dirname}/../../attachments`;

const attachmentSavePromises = {};

const attachmentStorageTypes = {};

function getErrorResult(msg = null) {
  return {
    url: `La pièce jointe n'a pas pu être enregistrée${msg ? " : " + msg : ""}`,
    failed: true
  };
}

/**
 * @callback AddAttachmentStorageTypeFn
 * @param {string} name
 * @param {AttachmentStorageTypeHandler} handler
 */

/**
 * @callback AttachmentStorageTypeHandler
 * @param {Eris.Attachment} attachment
 * @return {AttachmentStorageTypeResult|Promise<AttachmentStorageTypeResult>}
 */

/**
 * @typedef {object} AttachmentStorageTypeResult
 * @property {string} url
 */

/**
 * @callback DownloadAttachmentFn
 * @param {Eris.Attachment} attachment
 * @param {number?} tries Used internally, don't pass
 * @return {Promise<DownloadAttachmentResult>}
  */

/**
 * @typedef {object} DownloadAttachmentResult
 * @property {string} path
 * @property {DownloadAttachmentCleanupFn} cleanup
 */

/**
 * @callback DownloadAttachmentCleanupFn
 * @return {void}
 */

/**
 * Saves the given attachment based on the configured storage system
 * @callback SaveAttachmentFn
 * @param {Eris.Attachment} attachment
 * @returns {Promise<{ url: string }>}
 */

/**
 * @type {AttachmentStorageTypeHandler}
 */
let passthroughOriginalAttachment; // Workaround to inconsistent IDE bug with @type and anonymous functions
passthroughOriginalAttachment = (attachment) => {
  return { url: attachment.url };
};

/**
 * An attachment storage option that downloads each attachment and serves them from a local web server
 * @type {AttachmentStorageTypeHandler}
 */
let saveLocalAttachment; // Workaround to inconsistent IDE bug with @type and anonymous functions
saveLocalAttachment = async (attachment) => {
  const targetPath = getLocalAttachmentPath(attachment.id);

  try {
    // If the file already exists, resolve immediately
    await access(targetPath);
    const url = await getLocalAttachmentUrl(attachment.id, attachment.filename);
    return { url };
  } catch (e) {}

  // Download the attachment
  const downloadResult = await downloadAttachment(attachment);

  // Move the temp file to the attachment folder
  await mv(downloadResult.path, targetPath);

  // Resolve the attachment URL
  const url = await getLocalAttachmentUrl(attachment.id, attachment.filename);

  return { url };
};

/**
 * @type {DownloadAttachmentFn}
 */
const downloadAttachment = (attachment, tries = 0) => {
  return new Promise((resolve, reject) => {
    if (tries > 3) {
      console.error("Échec du téléchargement de la pièce jointe après 3 essais :", attachment);
      reject("Échec du téléchargement de la pièce jointe après 3 essais");
      return;
    }

    tmp.file((err, filepath, fd, cleanupCallback) => {
      if (err) {
        reject(err);
        return;
      }

      const writeStream = fs.createWriteStream(filepath);

      https.get(attachment.url, (res) => {
        res.pipe(writeStream);
        writeStream.on("finish", () => {
          writeStream.end();
          resolve({
            path: filepath,
            cleanup: cleanupCallback
          });
        });
      }).on("error", () => {
        fs.unlink(filepath);
        console.error("Erreur lors du téléchargement de la pièce jointe, nouvelle tentative");
        resolve(downloadAttachment(attachment, tries++));
      });
    });
  });
};

/**
 * Returns the filesystem path for the given attachment id
 * @param {String} attachmentId
 * @returns {String}
 */
function getLocalAttachmentPath(attachmentId) {
  return `${localAttachmentDir}/${attachmentId}`;
}

/**
 * Returns the self-hosted URL to the given attachment ID
 * @param {String} attachmentId
 * @param {String=null} desiredName Custom name for the attachment as a hint for the browser
 * @returns {Promise<String>}
 */
function getLocalAttachmentUrl(attachmentId, desiredName = null) {
  if (desiredName == null) desiredName = "file.bin";
  return getUtils().getSelfUrl(`attachments/${attachmentId}/${desiredName}`);
}

/**
 * An attachment storage option that downloads each attachment and re-posts them to a specified Discord channel.
 * The re-posted attachment is then linked in the actual thread.
 * @type {AttachmentStorageTypeHandler}
 */
let saveDiscordAttachment; // Workaround to inconsistent IDE bug with @type and anonymous functions
saveDiscordAttachment = async (attachment) => {
  if (attachment.size > 1024 * 1024 * 8) {
    return getErrorResult("pièce jointe trop volumineuse (max 8 Mo)");
  }

  const attachmentChannelId = config.attachmentStorageChannelId;
  const inboxGuild = utils.getInboxGuild();

  if (! inboxGuild.channels.has(attachmentChannelId)) {
    throw new Error("Salon de stockage des pièces jointes introuvable !");
  }

  const attachmentChannel = inboxGuild.channels.get(attachmentChannelId);
  if (! (attachmentChannel instanceof Eris.TextChannel)) {
    throw new Error("Le salon de stockage des pièces jointes doit être un salon textuel !");
  }

  const file = await attachmentToDiscordFileObject(attachment);
  const savedAttachment = await createDiscordAttachmentMessage(attachmentChannel, file);
  if (! savedAttachment) return getErrorResult();

  return { url: savedAttachment.url };
};

async function createDiscordAttachmentMessage(channel, file, tries = 0) {
  tries++;

  try {
    const attachmentMessage = await channel.createMessage(undefined, file);
    return attachmentMessage.attachments[0];
  } catch (e) {
    if (tries > 3) {
      console.error(`Impossible de créer le message de stockage de pièce jointe après 3 essais : ${e.message}`);
      return;
    }

    return createDiscordAttachmentMessage(channel, file, tries);
  }
}

/**
 * Turns the given attachment into a file object that can be sent forward as a new attachment
 * @param {Eris.Attachment} attachment
 * @returns {Promise<Eris.MessageFile>}
 */
async function attachmentToDiscordFileObject(attachment) {
  const downloadResult = await downloadAttachment(attachment);
  const data = await readFile(downloadResult.path);
  downloadResult.cleanup();
  // Attachments with duplicate filenames get dropped silently by the API, so give every attachment a unique filename
  // This commonly happens when pasting images as attachments, as they get named "unknown.png"
  const ext = path.extname(attachment.filename) || ".dat";
  const filename = `${attachment.id}${ext}`;
  return { file: data, name: filename };
}

/**
 * @type {SaveAttachmentFn}
 */
const saveAttachment = (attachment) => {
  if (attachmentSavePromises[attachment.id]) {
    return attachmentSavePromises[attachment.id];
  }

  if (attachmentStorageTypes[config.attachmentStorage]) {
    attachmentSavePromises[attachment.id] = Promise.resolve(attachmentStorageTypes[config.attachmentStorage](attachment));
  } else {
    throw new Error(`Option de stockage des pièces jointes inconnue : ${config.attachmentStorage}`);
  }

  attachmentSavePromises[attachment.id].then(() => {
    delete attachmentSavePromises[attachment.id];
  });

  return attachmentSavePromises[attachment.id];
};

/**
 * @type AddAttachmentStorageTypeFn
 */
const addStorageType = (name, handler) => {
  attachmentStorageTypes[name] = handler;
};

addStorageType("original", passthroughOriginalAttachment);
addStorageType("local", saveLocalAttachment);
addStorageType("discord", saveDiscordAttachment);

module.exports = {
  getLocalAttachmentPath,
  attachmentToDiscordFileObject,
  saveAttachment,
  addStorageType,
  downloadAttachment
};
