var xtend = require('xtend');
var client = require('../');
var ui = require('../lib/ui');
var editable = require('../lib/editable');

var stringify = function(map) {
	return Object.keys(map || {}).reduce(function(str, key) {
		return str + key+'='+map[key]+'\n';
	}, '');
};

module.exports = function(id, opts) {
	if (!id) return ui.error('Service name required');

	var c = client(opts);
	var unspin = ui.spin('Updating', id);

	var done = function(err) {
		if (err) return unspin(err);
		c.update(id, opts, function(err) {
			unspin(err);
			if (!opts.restart) return;
			unspin = ui.spin('Restarting', id);
			c.restart(id, unspin);
		});
	};

	if (!opts.env && !opts.tags && !opts.start && !opts.build) return done();

	c.get(id, function(err, service) {
		if (err) return done(err);
		editable(id, service, opts, done);
	});
};