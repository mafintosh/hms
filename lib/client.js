var protocol = require('./protocol');
var http = require('http');
var once = require('once');
var thunky = require('thunky');
var xtend = require('xtend');
var events = require('events');
var rte = require('readtoend');
var parse = require('./parse-remote');
var qs = require('querystring');
var pump = require('pump');
var stream = require('stream');

var noop = function() {};

module.exports = function(remote, opts) {
	remote = parse(remote, opts);

	var client = new events.EventEmitter();
	var subs = {};

	if (remote.agent) {
		remote.agent.on('verify', function(hash, cb) {
			if (!client.emit('verify', hash, cb)) cb();
		});
	}

	var connect = thunky(function loop(cb) {
		var req = http.request(xtend(remote, {method:'CONNECT'}));

		cb = once(cb);

		req.on('error', cb);
		req.on('connect', function(res, socket, data) {
			var p = protocol(socket, data);

			p.on('close', function() {
				subs = {};
				client.emit('close');
				connect = thunky(loop);
			});

			p.on('stdout', function(id, origin, data) {
				client.emit('stdout', id, origin, data);
			});

			p.on('stderr', function(id, origin, data) {
				client.emit('stderr', id, origin, data);
			});

			p.on('spawn', function(id, origin, pid) {
				client.emit('spawn', id, origin, pid);
			});

			p.on('exit', function(id, origin, code) {
				client.emit('exit', id, origin, code);
			});

			p.ping();

			cb(null, p, socket);
		});

		req.end();
	});

	var refs = 0;
	var incref = function(cb, fn) {
		if (!cb) cb = noop;
		connect(function(err, p, socket) {
			if (err) return cb(err);
			if (!refs++) socket.ref();
			fn(p, function(err, val) {
				if (!--refs && !client.subscriptions().length) socket.unref();
				cb(err, val);
			});
		});
	};

	var readError = function(stream, cb) {
		rte.readToEnd(stream, function(err, message) {
			cb(err || new Error(message));
		});
	};

	client.type = remote.type;

	client.deploy = function(id, opts, cb) {
		if (typeof opts === 'function') return client.deploy(id, null, opts);
		if (!opts) opts = {};

		var req = http.request(xtend(remote, {method:'PUT', path:'/'+id+'?'+qs.stringify(opts)}));

		if (cb) {
			req.on('error', cb);
			cb = once(cb);
		} else {
			cb = noop;
		}

		var done = function(err) {
			if (err) req.emit('error', err);
			cb(err);
		};

		var onbuild = function() {
			req.emit('build');
			req.emit('syncing');
			incref(done, function(p, cb) {
				p.sync(id, null, function(err) {
					if (err) return cb(err);
					req.emit('sync');
					req.emit('restarting');
					p.restart(id, function(err) {
						if (err) return cb(err);
						req.emit('restart');
						req.emit('success');
						cb();
					});
				});
			});
		};

		req.on('response', function(res) {
			if (res.statusCode === 204) {
				res.resume();
				return onbuild();
			}

			if (res.statusCode !== 200) return readError(res, done);

			if (!req.emit('building', res)) res.resume();

			res.on('end', function() {
				var status = parseInt(res.trailers['x-status'] || 200, 10);
				if (status !== 200) return done(new Error('Build failed'));
				onbuild();
			});
		});

		return req;
	};

	client.open = function(cb) {
		connect(cb);
	};

	client.tarball = function(id) {
		var tar = new stream.PassThrough();
		var req = http.request(xtend(remote, {method:'GET', path:'/'+id}));

		var destroy = function() {
			req.destroy();
		};

		req.on('response', function(res) {
			if (res.statusCode !== 200) return readError(res, tar.emit.bind(tar, 'error'));
			pump(res, tar);
		});

		tar.destroy = destroy;
		req.on('error', destroy);
		req.end();

		return tar;
	};

	client.add = function(id, opts, cb) {
		if (typeof opts === 'function') return client.add(id, null, opts);
		incref(cb, function(p, cb) {
			p.add(id, opts || {}, cb);
		});
	};

	client.update = function(id, opts, cb) {
		incref(cb, function(p, cb) {
			p.update(id, opts, cb);
		});
	};

	client.remove = function(id, cb) {
		incref(cb, function(p, cb) {
			p.remove(id, cb);
		});
	};

	client.get = function(id, cb) {
		incref(cb, function(p, cb) {
			p.get(id, cb);
		});
	};

	client.list = function(cb) {
		incref(cb, function(p, cb) {
			p.list(cb);
		});
	};

	client.sync = function(id, cb) {
		incref(cb, function(p, cb) {
			p.sync(id, null, cb);
		});
	};

	client.start = function(id, cb) {
		incref(cb, function(p, cb) {
			p.start(id, cb);
		});
	};

	client.restart = function(id, cb) {
		incref(cb, function(p, cb) {
			p.restart(id, cb);
		});
	};

	client.stop = function(id, cb) {
		incref(cb, function(p, cb) {
			p.stop(id, cb);
		});
	};

	client.ps = function(cb) {
		incref(cb, function(p, cb) {
			p.ps(function(err, docks) {
				if (err) return cb(err);

				docks.forEach(function(dock) {
					dock.list.forEach(function(proc) {
						if (proc.started) proc.started = new Date(proc.started);
						if (proc.deployed) proc.deployed = new Date(proc.deployed);
					});
				});

				cb(null, docks);
			});
		});
	};

	client.subscriptions = function() {
		return Object.keys(subs);
	};

	client.subscribing = function(id) {
		return !!subs[id];
	};

	client.subscribe = function(id, cb) {
		if (typeof id === 'function') return client.subscribe(null, id);
		if (!id) id = '*';

		subs[id] = subs[id] || thunky(function(cb) {
			incref(cb, function(p, cb) {
				p.subscribe(id, cb);
			});
		});

		subs[id](cb);
	};

	client.unsubscribe = function(id, cb) {
		if (typeof id === 'function') return client.unsubscribe(null, id);
		if (!id) id = '*';

		if (!cb) cb = noop;
		if (!subs[id]) return cb();
		delete subs[id];
		incref(cb, function(p, cb) {
			p.unsubscribe(id, cb);
		});
	};

	client.destroy = function(cb) {
		incref(cb, function(p, cb) {
			p.destroy();
			cb();
		});
	};

	return client;
};