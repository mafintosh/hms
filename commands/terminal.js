var util = require('util');
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
var deck = require('deck');
var once = require('once');
var proc = require('child_process');
var split = require('split2');
var hooks = require('hook-scripts')();
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

var shuffle = function(list) {
	return list.sort(function() {
		return Math.random() < 0.5 ? -1 : 1;
	});
};

module.exports = function(opts) {
	var server = root();
	var db = flat.sync(opts.db || 'terminal.db');
	var subs = subscriptions();
	var docks = [];

	var defaultEnv = {};

	[].concat(opts.env || []).forEach(function(env) {
		var parts = env.trim().split(/=/);
		var key = parts[0];
		var val = parts[1];
		if (key && val) defaultEnv[key.trim()] = val.trim();
	});

	var ondock = function(protocol, handshake) {
		protocol.id = handshake.id;
		handshake.protocol = protocol;
		docks.push(handshake);

		protocol.on('close', function() {
			docks.splice(docks.indexOf(handshake), 1);
			log(null, 'connection to dock ('+handshake.id+') dropped');
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

		log(null, 'connection to dock ('+handshake.id+') established');

		subs.subscriptions().forEach(function(key) {
			protocol.subscribe(key);
		});
	};

	var clean = opts.dock ? noop : function(dir) {
		rimraf(dir, noop);
	};

	var forEach = function(list, route, fn, cb) {
		cb = once(cb || noop);

		list = list.filter(function(dock) {
			return matchDock(route, dock);
		});

		var result = [];
		var missing = list.length;
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
		list.forEach(function(dock) {
			fn(dock, onresponse);
		});
	};

	subs.on('subscribe', function(id, protocol, count) {
		if (count > 1) return;
		log(id, 'subscribing to service events and logs');
		forEach(docks, null, function(dock, next) {
			dock.protocol.subscribe(id, next);
		});
	});

	subs.on('unsubscribe', function(id, protocol, count) {
		if (count) return;
		log(id, 'unsubscribing to service events and logs');
		forEach(docks, null, function(dock, next) {
			dock.protocol.unsubscribe(id, next);
		});
	});

	var save = function(id, opts, cb) {
		var service = xtend(db.get(id) || {id:id}, select(opts, ['start', 'build', 'limit', 'docks', 'tags', 'revision', 'env']));
		db.put(id, service, cb);
	};

	var onstatuschange = function(id, status, route, cb) {
		if (!db.has(id)) return cb(new Error('Service not found'));

		var service = db.get(id);

		var upd = {
			start:service.start,
			build:service.build,
			env:service.env,
			tags:service.tags,
			limit:service.limit,
			docks:service.docks
		};

		service.stopped = status === 'stop';
		db.put(id, service, function(err) {
			if (err) return cb(err);
			log(id, 'sending', status, 'to docks');
			forEach(docks, route, function(dock, next) {
				dock.protocol.update(id, upd, function(err) {
					if (err) return next(err);
					dock.protocol[status](id, next);
				});
			}, cb);
		});
	};

	var matchDock = function(route, dock) {
		if (!route) return true;
		return [dock.id].concat(dock.tags || []).some(function(tag) {
			return route === tag;
		});
	};

	var validService = function(service, dock) {
		var tags = service.tags || [];
		if (!tags.length && dock.default) return true;
		return [dock.id].concat(dock.tags || []).some(function(tag) {
			return tags.indexOf(tag) > -1;
		});
	};

	var arrayish = function(list) {
		if (!list) return [];
		if (Array.isArray(list)) return list;
		return [].concat(list);
	};

	var sync = function(service, route, cb) {
		if (!cb) cb = noop;
		if (!service.deployed) return cb();

		var validDocks = docks
			.filter(function(dock) {
				return validService(service, dock);
			})
			.map(function(dock) {
				return dock.id;
			});

		service.docks = arrayish(service.docks).filter(function(current) {
			return validDocks.indexOf(current) > -1;
		});

		if (typeof service.limit !== 'number') {
			service.docks = validDocks;
		} else {
			service.docks = service.docks.slice(0, service.limit);
			validDocks = deck.shuffle(validDocks);
			for (var i = 0; i < validDocks.length && service.docks.length < service.limit; i++) {
				if (service.docks.indexOf(validDocks[i]) === -1) service.docks.push(validDocks[i]);
			}
		}

		var purge = function(err) {
			if (err) return cb(err);

			var purged = docks.filter(function(dock) {
				return service.docks.indexOf(dock.id) === -1;
			});

			forEach(purged, null, function(dock, next) {
				dock.protocol.remove(service.id, next);
			}, cb);
		};

		var docksMap = {};
		docks.forEach(function(dock) {
			docksMap[dock.id] = dock;
		});

		var selected = service.docks.map(function(id) {
			return docksMap[id];
		});

		save(service.id, service, function(err) {
			if (err) return cb(err);
			forEach(selected, route, function(dock, next) {
				dock.protocol.sync(service.id, service, next);
			}, function(err) {
				if (err || service.stopped) return purge(err);
				forEach(selected, null, function(dock, next) {
					dock.protocol.start(service.id, next);
				}, purge);
			});
		});
	};

	var onclient = function(protocol, handshake) {
		protocol.on('add', function(id, opts, cb) {
			if (db.has(id)) return cb(new Error('Service already exist'));
			if (!/^[a-zA-Z0-9\-\.]+$/.test(id)) return cb(new Error('Service name should be alphanumericish'));
			log(id, 'adding new service');
			opts.env = xtend(defaultEnv, opts.env);
			save(id, opts, cb);
		});

		protocol.on('update', function(id, opts, cb) {
			if (!db.has(id)) return cb(new Error('Service not found'));
			log(id, 'updating service');
			save(id, opts, cb);
		});

		protocol.on('remove', function(id, cb) {
			log(id, 'removing service');
			forEach(docks, handshake.route, function(dock, next) {
				dock.protocol.remove(id, next);
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

		protocol.on('sync', function(id, service, cb) {
			if (!service) service = db.get(id);
			if (!service) return cb(new Error('Service not found'));
			log(id, 'syncing build to docks');
			sync(service, handshake.route, cb);
		});

		protocol.on('restart', function(id, cb) {
			onstatuschange(id, 'restart', handshake.route, function(err) {
				if (err) return cb(err);

				log(id, 'preparing to run post-restart hook');
				hooks('post-restart', [id], function(hook) {
					if (!hook) return cb();
					cb = once(cb);
					log(id, 'running post-restart hook');
					hook.on('close', function(code) {
						var msg = 'post-restart hook exited with code: ' + code;
						log(id, msg);
						if (code) return cb(new Error(msg));
						cb();
					});
					hook.on('error', cb);
					hook.stdout.pipe(split()).on('data', log.bind(null, id));
					hook.stderr.pipe(split()).on('data', log.bind(null, id));
				});
			});
		});

		protocol.on('start', function(id, cb) {
			onstatuschange(id, 'start', handshake.route, cb);
		});

		protocol.on('stop', function(id, cb) {
			onstatuschange(id, 'stop', handshake.route, cb);
		});

		protocol.on('ps', function(cb) {
			forEach(docks, handshake.route, function(dock, next) {
				dock.protocol.ps(next);
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
		var cwd = path.join('builds', id+'@'+deployed).replace(/:/g, '-');

		var onerror = function(status, message) {
			log(id, 'build failed ('+message+')');
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

		var preDeployHook = function() {
			log(id, 'preparing to run pre-deploy hook');
			hooks('pre-deploy', [id], function(hook) {
				if (!hook) return buildStep();
				var done = once(function(code) {
					if (util.isError(code)) return onerror(500, code.message);
					var msg = 'pre-deploy hook exited with code: ' + code;
					log(id, msg);
					if (code) return onerror(500, msg);
					buildStep();
				});
				log(id, 'running pre-deploy hook');
				hook.on('close', done);
				hook.on('error', done);
				hook.stdout.pipe(split()).on('data', log.bind(null, id));
				hook.stderr.pipe(split()).on('data', log.bind(null, id));
			});
		};

		var buildStep = function() {
			var service = db.get(id);

			if (!service.build) return ondone(204);

			var build = proc.spawn('/bin/sh', ['-c', service.build, path.join(cwd, 'build.sh'), id], {
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
		};

		log(id, 'receiving tarball');
		res.setHeader('Trailer', 'X-Status');
		pump(req, zlib.createGunzip(), tar.extract(cwd, {readable:true}), function(err) {
			if (err) return onerror(500, err.message);
			var service = db.get(id);
			if (!service) return onerror(404, 'Service not found');
			preDeployHook();
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
		socket.write(HANDSHAKE);

		var p = protocol(socket, data);

		p.once('handshake', function(handshake, cb) {
			if (!handshake) handshake = {};
			if (handshake.protocol !== protocol.version) return cb(new Error('Server and client do not speak the same protocol'));

			var reply = {type:'terminal', version:pkg.version};

			if (handshake.type === 'dock') {
				ondock(p, handshake);
				return cb(null, reply);
			}
			if (handshake.type === 'client') {
				onclient(p, handshake);
				return cb(null, reply);
			}

			cb(new Error('Invalid handshake'));
		});
	});

	var port = opts.port || 10002;
	server.listen(port, function() {
		log(null, 'listening on', port);
		if (opts.dock) require('./dock')('127.0.0.1:'+port, {port:port+1, id:opts.id, tag:opts.tag, default:true});
		if (opts.sync === false) return;
	});
};
