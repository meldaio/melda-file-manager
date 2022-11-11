const slugify = require("slugify")
/**
 * Creates a slug from the given string, supports Turkish chars
 * Uses "-" for whitespaces
 * @param  {String} text
 * @return {String}
 */
module.exports.slugify = text => slugify(text ||
  "", { replacement: "-", lower: true })
  .replace(/[^a-z0-9_-]/g, "")