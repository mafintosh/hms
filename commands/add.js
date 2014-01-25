var client = require('../');
var ui = require('../lib/ui');
var updateable = require('../lib/updateable');

var help = 'You need to specify the following properties\n'+
	'--start [start-script]\n'+
	'--docks [docks-to-deploy-to]';

module.exports = function(id, opts) {
	if (!id) return ui.error('Service name required');
	if (!opts.start || !opts.docks) return ui.error(help);

	if (opts.env) opts.env = parse(opts.env);

	var c = client(opts);
	var unspin = ui.spin('Adding', id);

	updateable(id, {}, opts, function(err) {
		if (err) return unspin(err);
		c.add(id, opts, unspin);
	});
};
