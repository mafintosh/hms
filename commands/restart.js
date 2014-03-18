var client = require('../');
var ui = require('../lib/ui');
var logStream = require('../lib/log-stream');

module.exports = function(remote, id, opts) {
	if (!id) return ui.error('Service name required');

	var c = client(remote);

	c.subscribe(id, function(err) {
		if (err) return ui.error(err);
	});

	var unspin = ui.spin('Restarting', id);
	c.restart(id, function(err) {
		unspin(err);

		console.log('\nForwarding', id, 'output\n');
		logStream(c).pipe(process.stdout);
	});
};
