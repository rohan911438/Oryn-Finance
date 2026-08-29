/* eslint-disable no-console */

const pkg = require('../../package.json');
console.log(`[smoke] starforge-cli version: ${pkg.version}`);

require('../../bin/starforge');
console.log('[smoke] CLI entrypoint loaded (no execution)');

