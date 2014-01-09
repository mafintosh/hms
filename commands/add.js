var client = require('../');
var ui = require('../lib/ui');
var parse = require('../lib/parse-env');

module.exports = function(id, opts) {
	if (!id) return ui.error('Service name required');

	if (opts.env) opts.env = parse(opts.env);

	var c = client(opts.remote);
	var unspin = ui.spin('Adding', id);
	c.add(id, opts, unspin);
};
