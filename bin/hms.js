#!/usr/bin/env node

var tab = require('tabalot');
var os = require('os');
var xtend = require('xtend');
var config = require('../lib/config');
var noop = [];

var ids = function(word, opts, cb) {
	var hms = require('../');
	var c = hms(opts.remote);
	c.list(function(err, list) {
		if (err) return cb(err);
		list = list.map(function(service) {
			return service.id;
		});
		cb(null, list);
	});
};

var help = function() {
	process.stderr.write(require('fs').readFileSync(require('path').join(__dirname, 'help')));
	process.exit(1);
};

var defaults = function(opts) {
	var conf = config.read();
	conf.fingerprint = conf.fingerprints ? conf.fingerprints[opts.remote] : null;
	return xtend(conf, opts);
};

tab('*')
	('--key', '-i', '-k', '@file')
	('--fingerprint', '-f')
	('--remote', '-r', '@host');

tab('list')
	(ids)
	(function(id, opts) {
		require('../commands/list')(id, defaults(opts));
	});

tab('add')
	(ids)
	('--start', '-s')
	('--build', '-b')
	('--tags', '-t')
	('--env', '-e')
	(function(id, opts) {
		require('../commands/add')(id, defaults(opts));
	});

tab('update')
	(ids)
	('--start', '-s')
	('--build', '-b')
	('--tags', '-t')
	('--env', '-e')
	('--restart')
	('--no-start')
	('--no-build')
	('--no-tags')
	('--no-env')
	(function(id, opts) {
		require('../commands/update')(id, defaults(opts));
	});

tab('remove')
	(ids)
	(function(id, opts) {
		require('../commands/remove')(id, defaults(opts));
	});

tab('start')
	(ids)
	(function(id, opts) {
		require('../commands/start')(id, defaults(opts));
	});

tab('restart')
	(ids)
	(function(id, opts) {
		require('../commands/restart')(id, defaults(opts));
	});

tab('stop')
	(ids)
	(function(id, opts) {
		require('../commands/stop')(id, defaults(opts));
	});

tab('ps')
	(ids)
	('--env', '-e')
	(function(id, opts) {
		require('../commands/ps')(id, defaults(opts));
	});

tab('log')
	(ids)
	('--no-events')
	('--no-id')
	('--no-origin')
	(function(id, opts) {
		require('../commands/log')(id, defaults(opts));
	});

tab('deploy')
	(ids)
	('--revision')
	('--force', '-f')
	(function(id, opts) {
		require('../commands/deploy')(id, defaults(opts));
	});

tab('sync')
	(ids)
	('--restart')
	(function(id, opts) {
		require('../commands/sync')(id, defaults(opts));
	});

tab('verify')
	('--expect', '-e')
	(function(opts) {
		require('../commands/verify')(opts);
	});

tab('tarball')
	(ids)
	('--out', '-o', '@file')
	(function(id, opts) {
		require('../commands/tarball')(id, defaults(opts));
	});

tab('dock')
	('--id', '-i', os.hostname())
	('--port', '-p', 10002)
	(function(opts) {
		require('../commands/dock')(defaults(opts));
	});

tab('terminal')
	('--port', '-p', 10002)
	('--dock', '-d')
	(function(opts) {
		require('../commands/terminal')(defaults(opts));
	});

tab()
	('--version', '-v')
	(function(opts) {
		if (opts.version) return console.log('v'+require('../package.json').version);
		help();
	});

tab.parse() || help();