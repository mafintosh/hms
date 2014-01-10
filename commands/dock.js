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
var respawns = require('respawn-group');
var protocol = require('../lib/protocol');
var parse = require('../lib/parse-remote');
var pkg = require('../package.json');

var HOST = os.hostname();
var HANDSHAKE =
	'HTTP/1.1 101 Swiching Protocols\r\n'+
	'Upgrade: hms-protocol\r\n'+
	'Connection: Upgrade\r\n\r\n';

var log = function(tag) {
	tag = '['+tag+']';
	console.log.apply(null, arguments);
};

module.exports = function(opts) {
	var server = root();
	var db = flat.sync('db');
	var mons = respawns();

	var remote = parse(opts.remote);
	var info = {};

	var onmon = function(id, service) {
		if (!service.start || !service.cwd) return false;

		var stale = mons.get(id) || {};
		var fresh = {command:['/bin/sh', '-c', service.start, id], cwd:service.cwd, env:service.env};

		if (JSON.stringify({command:stale.command, cwd:stale.cwd, env:stale.env}) === JSON.stringify(fresh)) return false;

		info[id] = {version:service.version, deployed:service.deployed};
		mons.add(id, fresh);
		return true;
	};

	var onprotocol = function(protocol, docking) {
		var onnotfound = function(cb) {
			return docking ? cb() : cb(new Error('Service not found'));
		};

		protocol.on('get', function(id, cb) {
			if (!db.has(id)) return onnotfound(cb);
			cb(null, db.get(id));
		});

		protocol.on('distribute', function(id, service, cb) { // TODO: reject build if we dont want it (aka aws naming scheme)
			if (!service) return cb(new Error('Service must be passed'));

			var cwd = path.join('builds', id+'@'+service.deployed);

			var done = once(function(err) {
				if (err) return onerror(err);
				log(id, 'distribute succeded');
				cb();
			});

			var upsert = function() {
				service.cwd = cwd;
				db.put(id, service, cb);
			};

			var onerror = function(err) {
				log(id, 'distribute failed ('+err.message+')');
				rimraf(cwd, function() {
					cb(err);
				});
			};

			var req = http.get(xtend(remote, {
				path:'/'+id,
				headers:{origin:HOST}
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
			log(id, 'stopping and removing process');
			mons.remove(id, function() {
				db.del(id, cb);
			});
		});

		protocol.on('update', function(id, opts, cb) {
			if (!db.has(id)) return onnotfound(cb);
			log(id, 'updating process');
			cb();
		});

		protocol.on('restart', function(id, cb) {
			if (!db.has(id)) return onnotfound(cb);
			log(id, 'restarting process');
			onmon(id, db.get(id));
			mons.restart(id);
			cb();
		});

		protocol.on('start', function(id, cb) {
			if (!db.has(id)) return onnotfound(cb);
			log(id, 'starting process');
			onmon(id, db.get(id));
			mons.start(id);
			cb();
		});

		protocol.on('stop', function(id, cb) {
			if (!db.has(id)) return onnotfound(cb);
			log(id, 'stopping process');
			onmon(id, db.get(id));
			mons.stop(id, function() {
				cb();
			});
		});

		protocol.on('ps', function(cb) {
			var list = mons.list().map(function(mon) {
				return xtend(mon.toJSON(), info[mon.id]);
			});

			cb(null, [{host:os.hostname(), list:list}]);
		});
	};

	var dropped = true;
	var connect = function() {
		var req = http.request(xtend(remote, {
			method:'CONNECT',
			path:'/dock',
			headers:{origin:HOST}
		}));

		var reconnect = once(function() {
			if (dropped) return setTimeout(connect, 5000);
			dropped = true;
			log('hms', 'connection to remote dropped');
			setTimeout(connect, 2500);
		});

		req.on('error', reconnect);
		req.on('connect', function(res, socket, data) {
			dropped = false;
			log('hms', 'connection to remote established');
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

	server.on('connect', function(req, socket, data) {
		socket.write(HANDSHAKE);
		onprotocol(protocol(socket, data), false);
	});

	server.listen(opts.port || 10002, function(addr) {
		log('hms', 'listening on', addr);

		db.keys().forEach(function(key) {

		});

		connect();
	});

	var shutdown = function() {
		log('hms', 'shutting down');
		mons.shutdown(function() {
			process.exit(0);
		});
	};

	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
};