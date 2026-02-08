const threads = require("../data/threads");
const snippets = require("../data/snippets");
const utils = require("../utils");
const { parseArguments } = require("knub-command-manager");

const whitespaceRegex = /\s/;
const quoteChars = ["'", "\""];

module.exports = ({ bot, knex, config, commands }) => {
  if (! config.allowSnippets) return;
  /**
   * « Rend » un snippet en remplaçant tous les paramètres, par exemple {1} {2}, par leurs arguments correspondants.
   * Le numéro dans l'espace réservé correspond à l'ordre de l'argument dans la liste, c'est-à-dire {1} est le premier argument (= index 0)
   * @param {String} body
   * @param {String[]} args
   * @returns {String}
   */
  function renderSnippet(body, args) {
    return body
      .replace(/(?<!\\){\d+}/g, match => {
        const index = parseInt(match.slice(1, -1), 10) - 1;
        return (args[index] != null ? args[index] : match);
      })
      .replace(/\\{/g, "{");
  }

  /**
   * Lorsqu'un membre de l'équipe utilise un snippet (préfixe du snippet + mot déclencheur), trouve le snippet et le publie comme réponse dans le fil
   */
  bot.on("messageCreate", async msg => {
    if (! await utils.messageIsOnInboxServer(bot, msg)) return;
    if (! utils.isStaff(msg.member)) return;

    if (msg.author.bot) return;
    if (! msg.content) return;
    if (! msg.content.startsWith(config.snippetPrefix) && ! msg.content.startsWith(config.snippetPrefixAnon)) return;

    let snippetPrefix, isAnonymous;

    if (config.snippetPrefixAnon.length > config.snippetPrefix.length) {
      // Le préfixe anonyme est plus long -> le vérifier en premier
      if (msg.content.startsWith(config.snippetPrefixAnon)) {
        snippetPrefix = config.snippetPrefixAnon;
        isAnonymous = true;
      } else {
        snippetPrefix = config.snippetPrefix;
        isAnonymous = false;
      }
    } else {
      // Le préfixe standard est plus long -> le vérifier en premier
      if (msg.content.startsWith(config.snippetPrefix)) {
        snippetPrefix = config.snippetPrefix;
        isAnonymous = false;
      } else {
        snippetPrefix = config.snippetPrefixAnon;
        isAnonymous = true;
      }
    }

    if (config.forceAnon) {
      isAnonymous = true;
    }

    const thread = await threads.findByChannelId(msg.channel.id);
    if (! thread) return;

    const snippetInvoke = msg.content.slice(snippetPrefix.length);
    if (! snippetInvoke) return;

    let [, trigger, rawArgs] = snippetInvoke.match(/(\S+)(?:\s+(.*))?/s);
    trigger = trigger.toLowerCase();

    const snippet = await snippets.get(trigger);
    if (! snippet) return;

    let args = rawArgs ? parseArguments(rawArgs) : [];
    args = args.map(arg => arg.value);
    const rendered = renderSnippet(snippet.body, args);

    const replied = await thread.replyToUser(msg.member, rendered, [], isAnonymous, msg.messageReference);
    if (replied) msg.delete();
  });

  // Affiche ou ajoute un snippet
  commands.addInboxServerCommand("snippet", "<trigger> [text$]", async (msg, args, thread) => {
    const snippet = await snippets.get(args.trigger);

    if (snippet) {
      if (args.text) {
        // Si le snippet existe et que nous tentons d'en créer un nouveau, informe l'utilisateur qu'il existe déjà
        utils.postSystemMessageWithFallback(msg.channel, thread, `Le snippet "${args.trigger}" existe déjà ! Vous pouvez le modifier ou le supprimer avec ${config.prefix}edit_snippet et ${config.prefix}delete_snippet respectivement.`);
      } else {
        // Si le snippet existe et que nous ne créons pas de nouveau snippet, affiche les informations sur le snippet existant
        utils.postSystemMessageWithFallback(msg.channel, thread, `\`${config.snippetPrefix}${args.trigger}\` répond avec : \`\`\`\n${utils.disableCodeBlocks(snippet.body)}\`\`\``);
      }
    } else {
      if (args.text) {
        // Si le snippet n'existe pas et que l'utilisateur souhaite le créer, crée-le
        await snippets.add(args.trigger, args.text, msg.author.id);
        utils.postSystemMessageWithFallback(msg.channel, thread, `Snippet "${args.trigger}" créé !`);
      } else {
        // Si le snippet n'existe pas et que l'utilisateur ne tente pas de le créer, indique comment le créer
        utils.postSystemMessageWithFallback(msg.channel, thread, `Le snippet "${args.trigger}" n'existe pas ! Vous pouvez le créer avec \`${config.prefix}snippet ${args.trigger} text\``);
      }
    }
  }, {
    aliases: ["s"]
  });

  commands.addInboxServerCommand("delete_snippet", "<trigger>", async (msg, args, thread) => {
    const snippet = await snippets.get(args.trigger);
    if (! snippet) {
      utils.postSystemMessageWithFallback(msg.channel, thread, `Le snippet "${args.trigger}" n'existe pas !`);
      return;
    }

    await snippets.del(args.trigger);
    utils.postSystemMessageWithFallback(msg.channel, thread, `Snippet "${args.trigger}" supprimé !`);
  }, {
    aliases: ["ds"]
  });

  commands.addInboxServerCommand("edit_snippet", "<trigger> <text$>", async (msg, args, thread) => {
    const snippet = await snippets.get(args.trigger);
    if (! snippet) {
      utils.postSystemMessageWithFallback(msg.channel, thread, `Le snippet "${args.trigger}" n'existe pas !`);
      return;
    }

    await snippets.del(args.trigger);
    await snippets.add(args.trigger, args.text, msg.author.id);

    utils.postSystemMessageWithFallback(msg.channel, thread, `Snippet "${args.trigger}" modifié !`);
  }, {
    aliases: ["es"]
  });

  commands.addInboxServerCommand("snippets", [], async (msg, args, thread) => {
    const allSnippets = await snippets.all();
    const triggers = allSnippets.map(s => s.trigger);
    triggers.sort();

    utils.postSystemMessageWithFallback(msg.channel, thread, `Snippets disponibles (préfixe ${config.snippetPrefix}) :\n${triggers.join(", ")}`);
  }, {
    aliases: ["s"]
  });
};
