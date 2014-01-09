var protocol = require('./protocol');
var http = require('http');
var once = require('once');
var thunky = require('thunky');
var xtend = require('xtend');
var events = require('events');

var noop = function() {};

module.exports = function(remote) {
	if (!remote) remote = '127.0.0.1';
	if (typeof remote === 'string') {
		var match = remote.match(/^([^:]+)(?::(\d+))?$/);
		remote = {host:match[1], port:match[2] || 10002};
	}

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

			p.on('stdout', function(id, data) {
				client.emit('stdout', id, data);
			});

			p.on('stderr', function(id, data) {
				client.emit('stderr', id, data);
			});

			p.on('spawn', function(id, pid) {
				client.emit('spawn', id, pid);
			});

			p.on('exit', function(id, code) {
				client.emit('exit', id, code);
			});

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
		subs[id] = subs[id] || thunky(function(cb) {
			incref(cb, function(p, cb) {
				p.subscribe(id, cb);
			});
		});

		subs[id](cb);
	};

	client.unsubscribe = function(id, cb) {
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