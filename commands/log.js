var client = require('../');
var ui = require('../lib/ui');

module.exports = function(id, opts) {
	if (!id) return ui.error('Service name required');

	var c = client(opts.remote);

	c.subscribe(id, function(err) {
		if (err) return ui.error(err);
	});

	c.on('stdout', function(id, data) {
		process.stdout.write(data);
	});

	c.on('stderr', function(id, data) {
		process.stderr.write(data);
	});

	if (opts.events === false) return;

	c.on('spawn', function(id, pid) {
		ui.highlight('Process spawned with pid '+pid);
	});

	c.on('exit', function(id, code) {
		ui.highlight('Process exited with code '+code);
	});
};