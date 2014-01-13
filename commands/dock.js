var http = require('http');
var root = require('root');
var flat = require('flat-file-db');
var path = require('path');
var tar = require('tar-fs');
var zlib = require('zlib');
var os = require('os');
var xtend = require('xtend');
var rimraf = require('rimraf');
var once = require('once');
var pump = require('pump');
var select = require('select-keys');
var shell = require('shell-quote');
var respawns = require('respawn-group');
var protocol = require('../lib/protocol');
var parse = require('../lib/parse-remote');
var subscriptions = require('../lib/subscriptions');
var pkg = require('../package.json');

var noop = function() {};

var HANDSHAKE =
	'HTTP/1.1 101 Swiching Protocols\r\n'+
	'Upgrade: hms-protocol\r\n'+
	'Connection: Upgrade\r\n\r\n';

var log = function(tag) {
	tag = tag ? '[dock] ['+tag+']' : '[dock]';
	console.log.apply(null, arguments);
};

module.exports = function(opts) {
	var server = root();
	var db = typeof opts.db == 'object' && opts.db || flat.sync('db');
	var mons = respawns();
	var subs = subscriptions();
	var origin = opts.id || os.hostname();

	subs.on('subscribe', function(id, protocol, count) {
		if (count > 1) return;
		log(id, 'forwarding events and output');
	});

	subs.on('unsubscribe', function(id, protocol, count) {
		if (count) return;
		log(id, 'unforwarding event and output');
	});

	mons.on('finalize', function(mon) {
		var cwd = db.has(mon.id) && db.get(mon.id).cwd;
		if (mon.cwd !== cwd) rimraf(mon.cwd, noop);
	});

	mons.on('stdout', function(mon, data) {
		subs.publish('stdout', mon.id, origin, data);
	});

	mons.on('stderr', function(mon, data) {
		subs.publish('stderr', mon.id, origin, data);
	});

	mons.on('spawn', function(mon, child) {
		log(mon.id, 'spawned '+child.pid);
		subs.publish('spawn', mon.id, origin, child.pid);
	});

	mons.on('exit', function(mon, code) {
		log(mon.id, 'exited ('+code+')');
		subs.publish('exit', mon.id, origin, code);
	});

	var remote = parse(opts.remote);
	var info = {};

	var onmon = function(id, service) {
		if (!service.start || !service.cwd) return false;

		var env = xtend(service.env);
		var stale = mons.get(id) || {};
		var cmd = shell.parse(service.start, service.env);
		var fresh = {command:cmd, cwd:service.cwd, env:env};

		if (JSON.stringify({command:stale.command, cwd:stale.cwd, env:stale.env}) === JSON.stringify(fresh)) return false;

		info[id] = {revision:service.revision, deployed:service.deployed};
		mons.add(id, fresh);
		return true;
	};

	var onstatuschange = function(id, status, cb) {
		if (!db.has(id)) return onnotfound(cb);
		onmon(id, db.get(id));

		var ondone = function() {
			if (!db.has(id)) return cb();
			var s = db.get(id);
			s.stopped = status === 'stop';
			db.put(id, s, cb);
		};

		switch (status) {
			case 'start':
			log(id, 'starting process');
			mons.start(id);
			return ondone();

			case 'restart':
			log(id, 'restarting process');
			mons.restart(id);
			return ondone();

			case 'stop':
			log(id, 'stopping process');
			return mons.stop(id, ondone);
		}
	};

	var onprotocol = function(protocol, docking) {
		var onnotfound = function(cb) {
			return docking ? cb() : cb(new Error('Service not found'));
		};

		protocol.on('get', function(id, cb) {
			if (!db.has(id)) return onnotfound(cb);
			cb(null, db.get(id));
		});

		protocol.on('sync', function(id, service, cb) {
			if (!docking) return cb(new Error('Cannot sync from a dock'));
			if (!service) return cb(new Error('Service must be passed'));

			var cwd = path.join('builds', id+'@'+service.deployed);

			var done = once(function(err) {
				if (err) return onerror(err);
				log(id, 'sync succeded');
				cb();
			});

			var upsert = function() {
				service.cwd = cwd;
				db.put(id, service, done);
			};

			var onerror = function(err) {
				log(id, 'sync failed ('+err.message+')');
				rimraf(cwd, function() {
					cb(err);
				});
			};

			var req = http.get(xtend(remote, {
				path:'/'+id,
				headers:{origin:origin}
			}));

			log(id, 'fetching build from remote');
			req.on('error', done);
			req.on('response', function(response) {
				if (response.statusCode !== 200) return done(new Error('Could not fetch build'));
				pump(response, zlib.createGunzip(), tar.extract(cwd), function(err) {
					if (err) return done(err);
					upsert();
				});
			});
		});

		protocol.on('list', function(cb) {
			var list = db.keys().map(function(key) {
				return db.get(key);
			});

			cb(null, list);
		});

		protocol.on('remove', function(id, cb) {
			if (!docking) return cb(new Error('Cannot remove on a dock'));
			log(id, 'stopping and removing process');
			mons.remove(id, function() {
				db.del(id, cb);
			});
		});

		protocol.on('update', function(id, opts, cb) {
			if (!docking) return cb(new Error('Cannot update on a dock'));
			if (!db.has(id)) return onnotfound(cb);
			log(id, 'updating process');
			db.put(id, xtend(db.get(id), select(opts, ['start', 'build', 'env', 'docks'])), cb);
		});

		protocol.on('restart', function(id, cb) {
			onstatuschange(id, 'restart', cb);
		});

		protocol.on('start', function(id, cb) {
			onstatuschange(id, 'start', cb);
		});

		protocol.on('stop', function(id, cb) {
			onstatuschange(id, 'stop', cb);
		});

		protocol.on('ps', function(cb) {
			var list = mons.list().map(function(mon) {
				return xtend(mon.toJSON(), info[mon.id]);
			});

			cb(null, [{id:origin, list:list}]);
		});

		protocol.on('subscribe', function(id, cb) {
			if (!docking && id !== '*' && !db.has(id)) return onnotfound(cb);
			subs.subscribe(id, protocol);
			cb();
		});

		protocol.once('subscribe', function() {
			protocol.on('close', function() {
				subs.clear(protocol);
			});
		});

		protocol.on('unsubscribe', function(id, cb) {
			subs.unsubscribe(id, protocol);
			cb();
		});
	};

	var dropped = true;
	var connect = function() {
		var req = http.request(xtend(remote, {
			method:'CONNECT',
			path:'/dock',
			headers:{origin:origin}
		}));

		var reconnect = once(function() {
			if (dropped) return setTimeout(connect, 5000);
			dropped = true;
			log(null, 'connection to remote dropped');
			setTimeout(connect, 2500);
		});

		req.on('error', reconnect);
		req.on('connect', function(res, socket, data) {
			dropped = false;
			log(null, 'connection to remote established');
			var p = protocol(socket, data);
			p.ping();
			p.on('close', reconnect);
			onprotocol(p, true);
		});

		req.end();
	};


	server.get('/', function(req, res) {
		res.end('hms-dock '+pkg.version+'\n');
	});

	server.error(function(req, res) {
		res.end('Cannot deploy to a dock');
	});

	server.on('connect', function(req, socket, data) {
		socket.write(HANDSHAKE);
		onprotocol(protocol(socket, data), false);
	});

	var port = opts.port || 10002;
	server.listen(port, function(addr) {
		log(null, origin, 'listening on', port);

		db.keys().forEach(function(key) {
			var service = db.get(key);
			if (service.stopped) onmon(key, service);
			else onstatuschange(key, 'start', noop);
		});

		connect();
	});

	var shutdown = function() {
		log(null, 'shutting down');
		mons.shutdown(function() {
			process.exit(0);
		});
	};

	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
};