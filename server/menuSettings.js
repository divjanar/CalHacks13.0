const crypto = require('node:crypto');

function menuSettings() {
  const reader = (process.env.MENU_READER || 'local').trim().toLowerCase();
  if (!['local', 'gemini'].includes(reader)) throw new Error('Configure MENU_READER as local or gemini.');
  const model = process.env.GEMINI_MENU_MODEL || process.env.GEMINI_MODEL;
  if (reader === 'gemini' && (!process.env.GEMINI_API_KEY?.trim() || !model?.trim())) {
    throw new Error('Configure GEMINI_API_KEY and GEMINI_MENU_MODEL or GEMINI_MODEL to use the Gemini menu reader. Use MENU_READER=local for key-free menus.');
  }
  // Never expose or log this identity. Rotation invalidates only the AI cache.
  const identity = reader === 'local' ? 'local-v2' : crypto.createHash('sha256')
    .update(JSON.stringify([model, process.env.GEMINI_API_KEY])).digest('hex');
  return { reader, identity };
}
module.exports = { menuSettings };
