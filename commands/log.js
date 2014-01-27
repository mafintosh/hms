var client = require('../');
var ui = require('../lib/ui');
var split = require('split');
var chalk = require('chalk');

module.exports = function(remote, id, opts) {
	var c = client(remote);

	c.subscribe(id, function(err) {
		if (err) return ui.error(err);
	});

	var streams = {};

	var padder = function() {
		var ws = ' ';
		return function(msg) {
			if (msg.length >= ws.length) ws = msg.replace(/./g, ' ')+' ';
			return msg+ws.slice(msg.length - ws.length);
		};
	};

	var padOrigin = padder();
	var padId = padder();

	var log = function(id, origin, message) {
		id = opts.id === false ? '' : chalk.yellow(padId(id));
		origin = opts.origin === false ? '' : chalk.grey(padOrigin(origin));
		console.log(id+origin+message);
	};

	var get = function(id, origin) {
		if (streams[id+'@'+origin]) return streams[id+'@'+origin];

		var s = streams[id+'@'+origin] = split();

		s.on('data', function(data) {
			log(id, origin, data);
		});

		return s;
	};

	c.on('stdout', function(id, origin, data) {
		get(id, origin).write(data);
	});

	c.on('stderr', function(id, origin, data) {
		get(id, origin).write(data);
	});

	if (opts.events === false) return;

	c.on('spawn', function(id, origin, pid) {
		log(id, origin, chalk.cyan('Process spawned with pid '+pid));
	});

	c.on('exit', function(id, origin, code) {
		log(id, origin, chalk.cyan('Process exited with code '+code));
	});
};