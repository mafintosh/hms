var client = require('../');
var ui = require('../lib/ui');
var chalk = require('chalk');
var logStream = require('../lib/log-stream');

module.exports = function(remote, id, opts) {
	var c = client(remote);

	c.subscribe(id, function(err) {
		if (err) return ui.error(err);
	});

	logStream(c).pipe(process.stdout);
};