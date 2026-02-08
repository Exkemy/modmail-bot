const moment = require("moment");
const knex = require("../knex");
const { normalizeLanguage } = require("../translation");
const UserProfile = require("./UserProfile");

/**
 * @param {string} userId
 * @returns {Promise<UserProfile|null>}
 */
async function findUserProfile(userId) {
  const row = await knex("user_profiles")
    .where("user_id", userId)
    .first();

  return row ? new UserProfile(row) : null;
}

/**
 * Creates or updates the stored Steam ID for a user.
 * @param {string} userId
 * @param {string} steamId
 * @returns {Promise<UserProfile>}
 */
async function saveSteamId(userId, steamId, language = null) {
  const existing = await findUserProfile(userId);
  const now = moment.utc().format("YYYY-MM-DD HH:mm:ss");
  const normalizedLanguage = language ? normalizeLanguage(language) : null;

  if (existing) {
    const updateData = {
      steam_id: steamId,
      updated_at: now,
    };

    if (normalizedLanguage) {
      updateData.language = normalizedLanguage;
    }

    await knex("user_profiles")
      .where("user_id", userId)
      .update(updateData);
  } else {
    const insertData = {
      user_id: userId,
      steam_id: steamId,
      created_at: now,
      updated_at: now,
    };

    if (normalizedLanguage) {
      insertData.language = normalizedLanguage;
    }

    await knex("user_profiles").insert({
      ...insertData,
    });
  }

  return await findUserProfile(userId);
}

/**
 * Saves the user's preferred language. Creates a profile if one does not exist.
 * @param {string} userId
 * @param {string} language
 * @returns {Promise<UserProfile|null>}
 */
async function saveLanguage(userId, language) {
  const existing = await findUserProfile(userId);
  const now = moment.utc().format("YYYY-MM-DD HH:mm:ss");
  const normalizedLanguage = normalizeLanguage(language);

  if (existing) {
    await knex("user_profiles")
      .where("user_id", userId)
      .update({
        language: normalizedLanguage,
        updated_at: now,
      });
  } else {
    await knex("user_profiles").insert({
      user_id: userId,
      language: normalizedLanguage,
      created_at: now,
      updated_at: now,
    });
  }

  return await findUserProfile(userId);
}

module.exports = {
  findUserProfile,
  saveSteamId,
  saveLanguage,
};
