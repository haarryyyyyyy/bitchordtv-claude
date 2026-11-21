// Loads the app's plain scripts into Node for tests: they attach to one BC namespace.
global.window = undefined;
const path = require('path');
module.exports = function load(...files) {
  let BC;
  for (const f of files) BC = require(path.join(__dirname, '..', 'app', 'js', f));
  return global.BC;
};
