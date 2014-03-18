var client = require('../');
var ui = require('../lib/ui');
var logStream = require('../lib/log-stream');

module.exports = function(remote, id, opts) {
	if (!id) return ui.error('Service name required');

	var c = client(remote);

	c.subscribe(id, function(err) {
		if (err) return ui.error(err);
	});

	var unspin = ui.spin('Starting', id);
	c.start(id, function(err) {
		unspin(err);

		if (opts.log === false) return;
		console.log('\nForwarding', id, 'output\n');
		logStream(c).pipe(process.stdout);
	});
};
