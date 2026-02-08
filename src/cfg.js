const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const schema = require("./data/cfg.schema.json");
const cliOpts = require("./cliOpts");

/** @type {ModmailConfig} */
let config = {};

// Auto-detected config files, in priority order
const configFilesToSearch = [
  "config.ini",
  "config.json",
  "config.json5",
  "config.js",

  // Possible config files when file extensions are hidden
  "config.ini.ini",
  "config.ini.txt",
  "config.json.json",
  "config.json.txt",
  "config.json.ini",
];

let configFileToLoad;

const requestedConfigFile = cliOpts.config || cliOpts.c; // CLI option --config/-c
if (requestedConfigFile) {
  try {
    // Config files specified with --config/-c are loaded from cwd
    fs.accessSync(requestedConfigFile);
    configFileToLoad = requestedConfigFile;
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(`Le fichier de configuration spécifié est introuvable : ${requestedConfigFile}`);
    } else {
      console.error(`Erreur lors de la lecture du fichier de configuration spécifié ${requestedConfigFile} : ${e.message}`);
    }

    process.exit(1);
  }
} else {
  for (const configFile of configFilesToSearch) {
    try {
      // Auto-detected config files are always loaded from the bot's folder, even if the cwd differs
      const relativePath = path.relative(process.cwd(), path.resolve(__dirname, "..", configFile));
      fs.accessSync(relativePath);
      configFileToLoad = relativePath;
      break;
    } catch (e) {}
  }
}

// Load config values from a config file (if any)
if (configFileToLoad) {
  const srcRelativePath = path.resolve(__dirname, process.cwd(), configFileToLoad);
  console.log(`Chargement de la configuration depuis ${configFileToLoad}...`);

  try {
    if (configFileToLoad.endsWith(".js")) {
      config = require(srcRelativePath);
    } else {
      const raw = fs.readFileSync(configFileToLoad, {encoding: "utf8"});
      if (configFileToLoad.endsWith(".ini") || configFileToLoad.endsWith(".ini.txt")) {
        config = require("ini").decode(raw);
      } else {
        config = require("json5").parse(raw);
      }
    }
  } catch (e) {
    throw new Error(`Erreur lors de la lecture du fichier de configuration ! L'erreur retournée est : ${e.message}`);
  }
}

// Set dynamic default values which can't be set in the schema directly
config.dbDir = path.join(__dirname, "..", "db");
config.logDir = path.join(__dirname, "..", "logs"); // Only used for migrating data from older Modmail versions

// Load config values from environment variables
require("dotenv").config();

const envKeyPrefix = "MM_";
let loadedEnvValues = 0;

for (const [key, value] of Object.entries(process.env)) {
  if (! key.startsWith(envKeyPrefix)) continue;

  // MM_CLOSE_MESSAGE -> closeMessage
  // MM_COMMAND_ALIASES__MV => commandAliases.mv
  const configKey = key.slice(envKeyPrefix.length)
    .toLowerCase()
    .replace(/([a-z])_([a-z])/g, (m, m1, m2) => `${m1}${m2.toUpperCase()}`)
    .replace("__", ".");

  config[configKey] = value.includes("||")
    ? value.split("||")
    : value;

  loadedEnvValues++;
}

if (process.env.PORT && ! process.env.MM_PORT) {
  // Special case: allow common "PORT" environment variable without prefix
  config.port = process.env.PORT;
  loadedEnvValues++;
}

if (loadedEnvValues > 0) {
  console.log(`Chargé ${loadedEnvValues} ${loadedEnvValues === 1 ? "valeur" : "valeurs"} depuis les variables d'environnement`);
}

// Convert config keys with periods to objects
// E.g. commandAliases.mv -> commandAliases: { mv: ... }
for (const [key, value] of Object.entries(config)) {
  if (! key.includes(".")) continue;

  const keys = key.split(".");
  let cursor = config;
  for (let i = 0; i < keys.length; i++) {
    if (i === keys.length - 1) {
      cursor[keys[i]] = value;
    } else {
      cursor[keys[i]] = cursor[keys[i]] || {};
      cursor = cursor[keys[i]];
    }
  }

  delete config[key];
}

/**
 * Parse JSON string entries in ticketReasonOptions so that INI configs using
 * e.g. ticketReasonOptions[] = {"label": "...", "value": "..."} validate
 * correctly against the schema.
 */
function parseTicketReasonOptions() {
  if (! config.ticketReasonOptions) return;

  // New flat array format: ticketReasonOptions[] = {"label": "...", "value": "..."}
  if (Array.isArray(config.ticketReasonOptions)) {
    config.ticketReasonOptions = config.ticketReasonOptions.map(option => {
      if (typeof option !== "string") return option;

      try {
        return JSON.parse(option);
      } catch (err) {
        console.warn(`Impossible de parser ticketReasonOptions en JSON : ${err.message || err}`);
        return option;
      }
    });
    return;
  }

  // Legacy object format: ticketReasonOptions.pve[] = {"label": "...", "value": "..."}
  for (const mode of Object.keys(config.ticketReasonOptions)) {
    const options = config.ticketReasonOptions[mode];
    if (! Array.isArray(options)) continue;

    config.ticketReasonOptions[mode] = options.map(option => {
      if (typeof option !== "string") return option;

      try {
        return JSON.parse(option);
      } catch (err) {
        console.warn(`Impossible de parser ticketReasonOptions.${mode} en JSON : ${err.message || err}`);
        return option;
      }
    });
  }
}

parseTicketReasonOptions();

/**
 * Parse JSON string entries in supportedLanguages.
 */
function parseSupportedLanguages() {
  if (! config.supportedLanguages || ! Array.isArray(config.supportedLanguages)) return;

  config.supportedLanguages = config.supportedLanguages.map(lang => {
    if (typeof lang !== "string") return lang;

    try {
      return JSON.parse(lang);
    } catch (err) {
      console.warn(`Impossible de parser supportedLanguages en JSON : ${err.message || err}`);
      return lang;
    }
  });
}

parseSupportedLanguages();

// mainGuildId => mainServerId
// mailGuildId => inboxServerId
if (config.mainGuildId && ! config.mainServerId) {
  config.mainServerId = config.mainGuildId;
}
if (config.mailGuildId && ! config.inboxServerId) {
  config.inboxServerId = config.mailGuildId;
}

if (! config.dbType) {
  config.dbType = "sqlite";
}

if (! config.sqliteOptions) {
  config.sqliteOptions = {
    filename: path.resolve(__dirname, "..", "db", "data.sqlite"),
  };
}

if (! config.logOptions) {
  config.logOptions = {};
}

config.categoryAutomation = config.categoryAutomation || {};
// categoryAutomation.newThreadFromGuild => categoryAutomation.newThreadFromServer
if (config.categoryAutomation && config.categoryAutomation.newThreadFromGuild && ! config.categoryAutomation.newThreadFromServer) {
  config.categoryAutomation.newThreadFromServer = config.categoryAutomation.newThreadFromGuild;
}

// guildGreetings => serverGreetings
if (config.guildGreetings && ! config.serverGreetings) {
  config.serverGreetings = config.guildGreetings;
}

// Move greetingMessage/greetingAttachment to the serverGreetings object internally
// Or, in other words, if greetingMessage and/or greetingAttachment is set, it is applied for all servers that don't
// already have something set up in serverGreetings. This retains backwards compatibility while allowing you to override
// greetings for specific servers in serverGreetings.
config.serverGreetings = config.serverGreetings || {};
if (config.greetingMessage || config.greetingAttachment) {
  for (const guildId of config.mainServerId) {
    if (config.serverGreetings[guildId]) continue;
    config.serverGreetings[guildId] = {
      message: config.greetingMessage,
      attachment: config.greetingAttachment
    };
  }
}

// newThreadCategoryId is syntactic sugar for categoryAutomation.newThread
if (config.newThreadCategoryId) {
  config.categoryAutomation = config.categoryAutomation || {};
  config.categoryAutomation.newThread = config.newThreadCategoryId;
  delete config.newThreadCategoryId;
}

// Delete empty string options (i.e. "option=" without a value in config.ini)
for (const [key, value] of Object.entries(config)) {
  if (value === "") {
    delete config[key];
  }
}

// Validate config and assign defaults (if missing)
const ajv = new Ajv({
  useDefaults: true,
  coerceTypes: "array",
  allowUnionTypes: true,
});

/**
 * @param {string[]} errors
 * @returns void
 */
function exitWithConfigurationErrors(errors) {
  console.error("");
  console.error("REMARQUE ! Problèmes dans la configuration :");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  console.error("");
  console.error("Veuillez redémarrer le bot après avoir corrigé les problèmes mentionnés ci-dessus.");
  console.error("");

  process.exit(1);
}

// https://github.com/ajv-validator/ajv/issues/141#issuecomment-270692820
const truthyValues = ["1", "true", "on", "yes"];
const falsyValues = ["0", "false", "off", "no"];
ajv.addKeyword({
  keyword: "coerceBoolean",
  compile() {
    return (value, ctx) => {
      if (! value) {
        // Disabled -> no coercion
        return true;
      }

      // https://github.com/ajv-validator/ajv/issues/141#issuecomment-270777250
      // The "value" argument doesn't update within the same set of schemas inside "allOf",
      // so we're referring to the original property instead.
      // This also means we can't use { "type": "boolean" }, as it would test the un-updated data value.
      const realValue = ctx.parentData[ctx.parentDataProperty];

      if (typeof realValue === "boolean") {
        return true;
      }

      if (truthyValues.includes(realValue)) {
        ctx.parentData[ctx.parentDataProperty] = true;
      } else if (falsyValues.includes(realValue)) {
        ctx.parentData[ctx.parentDataProperty] = false;
      } else {
        return false;
      }

      return true;
    };
  },
});

ajv.addKeyword({
  keyword: "multilineString",
  compile() {
    return (value, ctx) => {
      if (! value) {
        // Disabled -> no coercion
        return true;
      }

      const realValue = ctx.parentData[ctx.parentDataProperty];
      if (typeof realValue === "string") {
        return true;
      }

      ctx.parentData[ctx.parentDataProperty] = realValue.join("\n");

      return true;
    };
  },
});

const validate = ajv.compile(schema);
const configIsValid = validate(config);
if (! configIsValid) {
  const errors = validate.errors.map(error => {
    if (error.params.missingProperty) {
      return `Option requise manquante : "${error.params.missingProperty}"`;
    } else {
      return `L'option "${error.instancePath.slice(1)}" ${error.message}. (Actuellement : ${typeof config[error.instancePath.slice(1)]})`;
    }
  });
  exitWithConfigurationErrors(errors);
}

const validStreamingUrlRegex = /^https:\/\/(www\.)?twitch.tv\/[a-z\d_\-]+\/?$/i;
if (config.statusType === "streaming") {
  if (! validStreamingUrlRegex.test(config.statusUrl)) {
    exitWithConfigurationErrors([
      "Lorsque statusType est défini sur \"streaming\", statusUrl doit être une URL de chaîne Twitch valide, comme https://www.twitch.tv/Dragory",
    ]);
  }
}

console.log("Configuration OK !");

/**
 * @type {ModmailConfig}
 */
module.exports = config;
