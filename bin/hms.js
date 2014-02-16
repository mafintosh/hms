#!/usr/bin/env node

var tab = require('tabalot');
var rm = require('../lib/remotes');
var os = require('os');

var remotes = function(word, opts, cb) {
	if (word.indexOf('@') > -1) return cb(null, '@host');
	cb(null, rm.list());
};

var resolve = function(remote, opts) {
	if (!remote) return require('../lib/ui').error('Remote is required');
	return require('xtend')(rm.read(remote) || {url:remote}, opts);
};

var help = function() {
	process.stderr.write(require('fs').readFileSync(require('path').join(__dirname, 'help')));
	process.exit(1);
};

var ids = function(word, opts, cb) {
	var client = require('../');
	var name = opts._[1];

	var c = client(resolve(opts._[1], opts));
	var cached = rm.cache(name, 'ids');

	if (cached) return cb(null, cached);

	c.list(function(err, list) {
		if (err) return cb(err);

		list = list.map(function(service) {
			return service.id;
		});

		cb(null, rm.cache(name, 'ids', list));
	});
};

tab('*')
	('--force', '-f')
	('--key', '-i', '-k', '@file')
	('--passphrase');

tab('remotes')
	('--yes', '-y')
	('--fingerprint')
	('--no-fingerprint')
	(['add', 'remove', 'list'])
	(remotes)
	('@host')
	(function(cmd, remote, host, opts) {
		require('../commands/remotes')(cmd, remote, host, opts);
	});

tab('add')
	('--start', '-s')
	('--build', '-b')
	('--docks', '-d')
	('--env', '-e')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		rm.cache(remote, 'ids', null);
		require('../commands/add')(resolve(remote, opts), id, opts);
	});

tab('remove')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		rm.cache(remote, 'ids', null);
		require('../commands/remove')(resolve(remote, opts), id, opts);
	});

tab('update')
	('--start', '-s')
	('--build', '-b')
	('--docks', '-d')
	('--env', '-e')
	('--restart')
	('--no-start')
	('--no-build')
	('--no-docks')
	('--no-env')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		require('../commands/update')(resolve(remote, opts), id, opts);
	});

tab('list')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		require('../commands/list')(resolve(remote, opts), id, opts);
	});

tab('ps')
	('--env', '-e')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		require('../commands/ps')(resolve(remote, opts), id, opts);
	});

tab('start')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		require('../commands/start')(resolve(remote, opts), id, opts);
	});

tab('stop')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		require('../commands/stop')(resolve(remote, opts), id, opts);
	});

tab('restart')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		require('../commands/restart')(resolve(remote, opts), id, opts);
	});

tab('log')
	('--no-events')
	('--no-id')
	('--no-origin')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		require('../commands/log')(resolve(remote, opts), id, opts);
	});

tab('sync')
	('--restart')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		require('../commands/sync')(resolve(remote, opts), id, opts);
	});

tab('deploy')
	('--revision', '-r')
	('--no-log')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		require('../commands/deploy')(resolve(remote, opts), id, opts);
	});

tab('tarball')
	('--out', '-o', '@file')
	(remotes)
	(ids)
	(function(remote, id, opts) {
		require('../commands/tarball')(resolve(remote, opts), id, opts);
	});

tab('dock')
	(remotes)
	('--id', '-i', os.hostname())
	('--port', '-p', 10002)
	('--db', '@file')
	(function(remote, opts) {
		require('../commands/dock')(resolve(remote, opts), opts);
	});

tab('terminal')
	('--port', '-p', 10002)
	('--dock', '-d')
	('--db', '@file')
	(function(opts) {
		require('../commands/terminal')(opts);
	});

tab()
	('--version', '-v')
	(function(opts) {
		if (opts.version) return console.log('v'+require('../package.json').version);
		help();
	});

tab.parse() || help();