const Eris = require("eris");

/**
 * @typedef AfterNewMessageReceivedHookData
 * @property {Eris.User} user
 * @property {Eris.Message} [message]
 * @property {CreateNewThreadForUserOpts} opts
 */

/**
 * @callback AfterNewMessageReceivedHookFn
 * @param {AfterNewMessageReceivedHookData} data
 * @return {void}
 */

/**
 * @callback AddAfterNewMessageReceivedHookFn
 * @param {AfterNewMessageReceivedHookFn} fn
 * @return {void}
 */

/**
 * @type AfterNewMessageReceivedHookFn[]
 */
const afterNewMessageReceivedHooks = [];

/**
 * @type {AddAfterNewMessageReceivedHookFn}
 */
let afterNewMessageReceived; // Solution de contournement pour un bug IDE incohérent avec @type et les fonctions anonymes
afterNewMessageReceived = (fn) => {
  afterNewMessageReceivedHooks.push(fn);
};

/**
 * @param {{
 *   user: Eris.User,
 *   message?: Eris.Message,
 *   opts: CreateNewThreadForUserOpts,
 * }} input
 */
async function callAfterNewMessageReceivedHooks(input) {
  for (const hook of afterNewMessageReceivedHooks) {
    await hook(input);
  }
}

module.exports = {
  afterNewMessageReceived: afterNewMessageReceived,
  callAfterNewMessageReceivedHooks: callAfterNewMessageReceivedHooks,
};
