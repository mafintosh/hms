var protocol = require('./protocol');
var http = require('http');
var once = require('once');
var thunky = require('thunky');
var xtend = require('xtend');
var events = require('events');
var rte = require('readtoend');
var parse = require('./parse-remote');

var noop = function() {};

module.exports = function(remote, opts) {
	remote = parse(remote, opts);

	var client = new events.EventEmitter();
	var subs = {};

	var connect = thunky(function(cb) {
		var req = http.request(xtend(remote, {method:'CONNECT'}));

		connecting = true;
		cb = once(cb);

		req.on('error', cb);
		req.on('connect', function(res, socket, data) {
			var p = protocol(socket, data);

			p.on('close', function() {
				client.emit('close');
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

	client.deploy = function(id, cb) {
		var req = http.request(xtend(remote, {method:'PUT', path:'/'+id}));

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
			req.emit('distributing');
			incref(done, function(p, cb) {
				p.distribute(id, null, function(err) {
					if (err) return cb(err);
					req.emit('distribute');
					req.emit('restarting');
					p.restart(id, function(err) {
						if (err) return cb(err);
						req.emit('restart');
						cb();
					});
				});
			});
		};

		var onerror = function(res) {
			rte.readToEnd(res, function(err, message) {
				done(err || new Error(message));
			});
		};

		req.on('response', function(res) {
			if (res.statusCode === 204) return onbuild();
			if (res.statusCode !== 200) return onerror(res);

			if (!req.emit('building', res)) res.resume();

			res.on('end', function() {
				var status = parseInt(res.trailers['x-status'] || 200, 10);
				if (status !== 200) return done(new Error('Build failed'));
				onbuild();
			});
		});

		return req;
	};

	client.open = connect;

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