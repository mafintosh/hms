var xtend = require('xtend');
var client = require('../');
var ui = require('../lib/ui');
var parse = require('../lib/parse-env');

module.exports = function(id, opts) {
	if (!id) return ui.error('Service name required');

	if (opts.env) opts.env = parse(opts.env);

	var c = client(opts.remote);
	var unspin = ui.spin('Updating', id);

	var done = function(err) {
		if (err) return unspin(err);
		c.update(id, opts, unspin);
	};

	var envAdd = opts['env-add'] && parse(opts['env-add']);
	if (!envAdd) return done();

	c.get(id, function(err, service) {
		if (err) return done(err);
		opts.env = xtend(service.env, envAdd);
		done();
	});
};