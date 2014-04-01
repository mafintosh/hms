var xtend = require('xtend');
var client = require('../');
var ui = require('../lib/ui');
var updateable = require('../lib/updateable');
var logStream = require('../lib/log-stream');

var stringify = function(map) {
	return Object.keys(map || {}).reduce(function(str, key) {
		return str + key+'='+map[key]+'\n';
	}, '');
};

var undef = function() {
	return Array.prototype.every.call(arguments, function(arg) {
		return arg === undefined;
	});
};

var help = 'You need to specify one (or more) of the following\n'+
	'--start [start-script]\n'+
	'--build [build-script]\n'+
	'--docks [docks-to-deploy-to]\n'+
	'--env   [NAME=var,NAME2=var2]';

module.exports = function(remote, id, opts) {
	if (!id) return ui.error('Service name required');
	if (!opts.force && undef(opts.env, opts.docks, opts.start, opts.build)) return ui.error(help);

	var c = client(remote);
	var unspin = ui.spin('Updating', id);

	var done = function(err) {
		if (err) return unspin(err);
		c.update(id, opts, function(err) {
			unspin(err);
			if (!opts.restart) return;
			unspin = ui.spin('Restarting', id);
			c.restart(id, function(err) {
				unspin(err);
				if (opts.log === false) return;
				console.log('\nForwarding', id, 'output\n');
				logStream(c).pipe(process.stdout);
			});
		});
	};

	if (!opts.env && !opts.docks && !opts.start && !opts.build) return done();

	c.get(id, function(err, service) {
		if (err) return done(err);
		updateable(id, service, opts, done);
	});
};