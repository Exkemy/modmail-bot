// Verify NodeJS version
const nodeMajorVersion = parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajorVersion < 12) {
  console.error("Version de Node.js non prise en charge ! Veuillez installer Node.js 12, 13 ou 14.");
  process.exit(1);
}

// Print out bot and Node.js version
const { getPrettyVersion } = require("./botVersion");
console.log(`Démarrage de Modmail ${getPrettyVersion()} sur Node.js ${process.versions.node} (${process.arch})`);

// Verify node modules have been installed
const fs = require("fs");
const path = require("path");

try {
  fs.accessSync(path.join(__dirname, "..", "node_modules"));
} catch (e) {
  console.error("Veuillez exécuter \"npm ci\" avant de démarrer le bot");
  process.exit(1);
}

const { BotError } = require("./BotError");
const { PluginInstallationError } = require("./PluginInstallationError");

// Error handling
// Force crash on unhandled rejections and uncaught exceptions.
// Use something like forever/pm2 to restart.
const MAX_STACK_TRACE_LINES = process.env.NODE_ENV === "development" ? Infinity : 8;

function errorHandler(err) {
  // Unknown message types (nitro boosting messages at the time) should be safe to ignore
  if (err && err.message && err.message.startsWith("Unhandled MESSAGE_CREATE type")) {
    return;
  }

  if (err) {
    if (typeof err === "string") {
      console.error(`Erreur : ${err}`);
    } else if (err instanceof BotError) {
      // Leave out stack traces for BotErrors (the message has enough info)
      console.error(`Erreur : ${err.message}`);
    } else if (err.message === "Disallowed intents specified") {
      let fullMessage = "Erreur : Des intents non autorisés ont été spécifiés";
      fullMessage += "\n\n";
      fullMessage += "Pour exécuter le bot, vous devez activer l'option \"Server Members Intent\" sur la page de votre bot dans le portail développeur Discord :";
      fullMessage += "\n\n";
      fullMessage += "1. Rendez-vous sur https://discord.com/developers/applications"
      fullMessage += "2. Cliquez sur votre bot"
      fullMessage += "3. Cliquez sur \"Bot\" dans la barre latérale"
      fullMessage += "4. Activez \"Server Members Intent\""

      console.error(fullMessage);
    } else if (err instanceof PluginInstallationError) {
      // Don't truncate PluginInstallationErrors as they can get lengthy
      console.error(err);
    } else {
      // Truncate long stack traces for other errors
      const stack = err.stack || "";
      let stackLines = stack.split("\n");
      if (stackLines.length > (MAX_STACK_TRACE_LINES + 2)) {
        stackLines = stackLines.slice(0, MAX_STACK_TRACE_LINES);
        stackLines.push(`    ...trace de la pile tronquée à ${MAX_STACK_TRACE_LINES} lignes`);
      }
      const finalStack = stackLines.join("\n");

      if (err.code) {
        console.error(`Erreur ${err.code} : ${finalStack}`);
      } else {
        console.error(`Erreur : ${finalStack}`);
      }
    }
  } else {
    console.error("Une erreur inconnue est survenue");
  }

  process.exit(1);
}

process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);

let testedPackage = "";
try {
  const packageJson = require("../package.json");
  const modules = Object.keys(packageJson.dependencies);
  modules.forEach(mod => {
    testedPackage = mod;
    fs.accessSync(path.join(__dirname, "..", "node_modules", mod))
  });
} catch (e) {
  console.error(`Veuillez relancer \"npm ci\" ! Le paquet \"${testedPackage}\" est manquant.`);
  process.exit(1);
}

(async function() {
  require("./cfg");
  const main = require("./main");
  const knex = require("./knex");

  // Make sure the database is up to date
  const [completed, newMigrations] = await knex.migrate.list();
  if (newMigrations.length > 0) {
    console.log("Mise à jour de la base de données. Cela peut prendre un moment. Ne fermez pas le bot !");
    await knex.migrate.latest();
    console.log("Terminé !");
  }

  // Start the bot
  main.start();
})();
