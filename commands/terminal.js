var http = require('http');
var root = require('root');
var flat = require('flat-file-db');
var fs = require('fs');
var rimraf = require('rimraf');
var path = require('path');
var tar = require('tar-fs');
var select = require('select-keys');
var xtend = require('xtend');
var zlib = require('zlib');
var url = require('url');
var pump = require('pump');
var os = require('os');
var thunky = require('thunky');
var once = require('once');
var proc = require('child_process');
var protocol = require('../lib/protocol');
var subscriptions = require('../lib/subscriptions');
var pkg = require('../package.json');

var noop = function() {};

var HANDSHAKE =
	'HTTP/1.1 101 Swiching Protocols\r\n'+
	'Upgrade: hms-protocol\r\n'+
	'Connection: Upgrade\r\n\r\n';

var log = function(tag) {
	tag = tag ? '[term] ['+tag+']' : '[term]';
	console.log.apply(null, arguments);
};

module.exports = function(opts) {
	var server = root();
	var db = flat.sync('db');
	var subs = subscriptions();
	var docks = [];

	var ondock = function(protocol, host) {
		protocol.on('close', function() {
			docks.splice(docks.indexOf(protocol), 1);
			log(null, 'connection to dock ('+host+') dropped');
		});

		protocol.on('stdout', function(id, origin, data) {
			subs.publish('stdout', id, origin, data);
		});

		protocol.on('stderr', function(id, origin, data) {
			subs.publish('stderr', id, origin, data);
		});

		protocol.on('spawn', function(id, origin, pid) {
			subs.publish('spawn', id, origin, pid);
		});

		protocol.on('exit', function(id, origin, code) {
			subs.publish('exit', id, origin, code);
		});

		docks.push(protocol);
		log(null, 'connection to dock ('+host+') established');

		subs.subscriptions().forEach(function(key) {
			protocol.subscribe(key);
		});
	};

	var clean = opts.dock ? noop : function(dir) {
		rimraf(dir, noop);
	};

	var forEach = function(fn, cb) {
		cb = once(cb || noop);

		var result = [];
		var missing = docks.length;
		var onresponse = function(err, val) {
			if (err) return cb(err);

			if (val && !Buffer.isBuffer(val)) {
				if (Array.isArray(val)) result.push.apply(result, val);
				else result.push(val);
			}

			if (--missing) return;
			cb(null, result);
		};

		if (!missing) return cb(null, result);
		docks.forEach(function(dock) {
			fn(dock, onresponse);
		});
	};

	subs.on('subscribe', function(id, protocol, count) {
		if (count > 1) return;
		log(id, 'subscribing to service events and logs');
		forEach(function(dock, next) {
			dock.subscribe(id, next);
		});
	});

	subs.on('unsubscribe', function(id, protocol, count) {
		if (count) return;
		log(id, 'unsubscribing to service events and logs');
		forEach(function(dock, next) {
			dock.unsubscribe(id, next);
		});
	});

	var save = function(id, opts, cb) {
		db.put(id, xtend(db.get(id) || {id:id}, select(opts, ['start', 'build', 'docks', 'revision', 'env'])), cb);
	};

	var onstatuschange = function(id, status, cb) {
		if (!db.has(id)) return cb(new Error('Service not found'));

		var service = db.get(id);
		var upd = {start:service.start, build:service.build, env:service.env, docks:service.docks};

		service.stopped = status === 'stop';
		db.put(id, service, function(err) {
			if (err) return cb(err);

			log(id, 'sending', status, 'to docks');
			forEach(function(dock, next) {
				dock.update(id, upd, function(err) {
					if (err) return next(err);
					dock[status](id, next);
				});
			}, cb);
		});
	};

	var onclient = function(protocol) {
		protocol.on('add', function(id, opts, cb) {
			if (db.has(id)) return cb(new Error('Service already exist'));
			if (!/^[a-zA-Z0-9\-\.]+$/.test(id)) return cb(new Error('Service name should be alphanumericish'));
			log(id, 'adding new service');
			save(id, opts, cb);
		});

		protocol.on('update', function(id, opts, cb) {
			if (!db.has(id)) return cb(new Error('Service not found'));
			log(id, 'updating service');
			save(id, opts, cb);
		});

		protocol.on('remove', function(id, cb) {
			log(id, 'removing service');
			forEach(function(dock, next) {
				dock.remove(id, next);
			}, function(err) {
				if (err) return cb(err);
				db.del(id, cb);
			});
		});

		protocol.on('get', function(id, cb) {
			if (!db.has(id)) return cb(new Error('Service not found'));
			cb(null, db.get(id));
		});

		protocol.on('list', function(cb) {
			var list = db.keys().map(function(key) {
				return db.get(key);
			});

			cb(null, list);
		});

		protocol.on('distribute', function(id, service, cb) {
			if (!service) service = db.get(id);
			if (!service) return cb(new Error('Service not found'));
			log(id, 'distributing build to docks');
			save(id, service, function(err) {
				if (err) return cb(err);
				forEach(function(dock, next) {
					dock.distribute(id, service, next);
				}, cb);
			});
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
			forEach(function(dock, next) {
				dock.ps(next);
			}, cb);
		});

		var unsubscribe = function(id, cb) {
			if (typeof cb !== 'function') cb = noop;
			var subs = subscriptions[id] = subscriptions[id] || [];
			var i = subs.indexOf(protocol);
			if (i === -1) return cb();

			log(id, 'client unsubscribing');
			if (subs.length === 1) delete subscriptions[id];
			else subs.splice(i, 1);
			cb();
		};

		protocol.on('subscribe', function(id, cb) {
			if (!db.has(id) && id !== '*') return cb(new Error('Service not found'));
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

	var cache = {};

	server.put('/{id}', function(req, res) {
		var id = req.params.id;
		var deployed = new Date().toISOString();
		var cwd = path.join('builds', id+'@'+deployed);

		var onerror = function(status, message) {
			log(id, 'build failed');
			rimraf(cwd, function() {
				res.statusCode = status;
				res.addTrailers({'X-Status': status});
				res.end(message);
			});
		};

		var ondone = function(status) {
			var service = db.get(id);
			var old = service.cwd;

			service.cwd = cwd;
			service.deployed = deployed;
			service.revision = req.query.revision;

			db.put(id, service, function(err) {
				if (err) return onerror(500);
				log(id, 'build succeded');
				if (old) clean(old);
				delete cache[id];
				res.statusCode = status;
				res.addTrailers({'X-Status': 200});
				res.end();
			});
		};

		log(id, 'receiving tarball');
		res.setHeader('Trailer', 'X-Status');
		pump(req, zlib.createGunzip(), tar.extract(cwd), function(err) {
			if (err) return onerror(500, err.message);

			var service = db.get(id);

			if (!service) return onerror(404, 'Service not found');
			if (!service.build) return ondone(204);

			var build = proc.spawn('/bin/sh', ['-c', service.build, id], {
				cwd:cwd,
				env:xtend(process.env, service.env)
			});

			build.stdout.pipe(res, {end:false});
			build.stderr.pipe(res, {end:false});

			build.on('error', function(err) {
				onerror(500);
			});

			build.on('close', function(code) {
				if (code) return onerror(500);
				if (!db.has(id)) return onerror(404);
				ondone(200);
			});
		});
	});

	server.get('/{id}', function(req, res) {
		var id = req.params.id;
		var service = db.get(id);

		if (!service) return res.error(404, 'Service not found');
		if (!service.cwd) return res.error(404, 'No builds found');

		if (!cache[id]) {
			log(id, 'writing tarball to cache');
			cache[id] = thunky(function(cb) {
				var tmp = path.join(os.tmpDir(), 'hms-'+id+'.tgz');
				pump(tar.pack(service.cwd), zlib.createGzip(), fs.createWriteStream(tmp), function(err) {
					if (err) return cb(err);
					cb(null, tmp);
				});
			});
		}

		log(id, 'sending tarball');
		cache[id](function(err, tmp) {
			if (err) return res.error(err);
			pump(fs.createReadStream(tmp), res);
		});
	});

	server.get('/', function(req, res) {
		res.end('hms-terminal '+pkg.version+'\n');
	});

	server.on('connect', function(req, socket, data) {
		var p = protocol(socket, data);
		socket.write(HANDSHAKE);
		if (req.url === '/dock') ondock(p, req.headers.origin || 'unknown');
		else onclient(p);
	});

	var port = opts.port || 10002;
	server.listen(port, function() {
		log(null, 'listening on', port);
		if (opts.dock) require('./dock')({port:port+1, remote:'127.0.0.1:'+port, id:opts.id, db:db});
	});
};