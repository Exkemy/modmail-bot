const https = require("https");
const config = require("./cfg");

const DEFAULT_LANGUAGE = "fr";
const SUPPORTED_LANGUAGES = ["fr", "en", "de", "es", "ru"];
const LANGUAGE_NAMES = {
  fr: "Francais",
  en: "English",
  de: "German",
  es: "Spanish",
  ru: "Russian",
};
const LANGUAGE_FLAGS = {
  fr: ":flag_fr:",
  en: ":flag_gb:",
  de: ":flag_de:",
  es: ":flag_es:",
  ru: ":flag_ru:",
};

function normalizeLanguage(language) {
  const code = (language || "").toLowerCase();
  return SUPPORTED_LANGUAGES.includes(code) ? code : DEFAULT_LANGUAGE;
}

function isSupportedLanguage(language) {
  const code = (language || "").toLowerCase();
  return SUPPORTED_LANGUAGES.includes(code);
}

function getLanguageName(language) {
  const code = normalizeLanguage(language);
  return LANGUAGE_NAMES[code] || code || DEFAULT_LANGUAGE;
}

function getLanguageFlag(language) {
  const code = normalizeLanguage(language);
  return LANGUAGE_FLAGS[code] || `:${code}:`;
}

function getApiKey() {
  return process.env.OPENAI_API_KEY || process.env.MM_OPENAI_API_KEY || config.openaiApiKey || config.translationApiKey || config.openaiApiToken;
}

async function translateText(text, targetLanguage, sourceLanguage = null) {
  const apiKey = getApiKey();
  if (! apiKey) {
    console.warn("[translation] Aucune cle OpenAI trouvee (OPENAI_API_KEY / MM_OPENAI_API_KEY / config). Pas de traduction.");
    return null;
  }
  if (! text || ! text.trim()) return null;

  const targetCode = normalizeLanguage(targetLanguage);
  const targetName = getLanguageName(targetCode);
  const sourceCode = sourceLanguage ? normalizeLanguage(sourceLanguage) : null;
  const sourceName = sourceCode ? getLanguageName(sourceCode) : null;

  const body = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a translation engine. Translate user messages to ${targetName}. Return only the translated text without quotes or commentary.`,
      },
      ...(sourceName ? [{
        role: "system",
        content: `Source language: ${sourceName}.`,
      }] : []),
      {
        role: "user",
        content: text,
      }
    ],
    temperature: 0.2,
  });

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };

  return new Promise(resolve => {
    const req = https.request("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers,
    }, res => {
      let responseBody = "";
      res.on("data", chunk => { responseBody += chunk; });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.warn(`Translation API returned status ${res.statusCode}`);
          return resolve(null);
        }

        try {
          const data = JSON.parse(responseBody);
          const choice = data.choices && data.choices[0];
          const translated = choice && choice.message && choice.message.content;
          resolve(translated ? translated.trim() : null);
        } catch (err) {
          console.warn(`Translation parsing error: ${err.message}`);
          resolve(null);
        }
      });
    });

    req.on("error", err => {
      console.warn(`Translation request error: ${err.message}`);
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}

module.exports = {
  translateText,
  normalizeLanguage,
  isSupportedLanguage,
  getLanguageName,
  getLanguageFlag,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
};
