var client = require('../');
var ui = require('../lib/ui');
var fs = require('fs');

module.exports = function(remote, id, opts) {
  if (!id) return ui.error('Service name required');

  var c = client(remote);
  var tar = c.tarball(id);

  tar.on('error', function(err) {
    ui.error(err);
  });

  tar.pipe(opts.out ? fs.createWriteStream(opts.out) : process.stdout);
};
