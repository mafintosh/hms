var client = require('../');
var ui = require('../lib/ui');
var editable = require('../lib/editable');

module.exports = function(id, opts) {
	if (!id) return ui.error('Service name required');

	if (opts.env) opts.env = parse(opts.env);

	var c = client(opts);
	var unspin = ui.spin('Adding', id);

	editable(id, {}, opts, function(err) {
		if (err) return unspin(err);
		c.add(id, opts, unspin);
	});
};
