const utils = require("../utils");

/**
 * @property {string} user_id
 * @property {string} steam_id
 * @property {string} language
 * @property {string} created_at
 * @property {string} updated_at
 */
class UserProfile {
  constructor(props) {
    utils.setDataModelProps(this, props);
  }
}

module.exports = UserProfile;
