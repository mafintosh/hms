var xtend = require('xtend');
var edit = require('string-editor');

var parseDocks = function(docks) {
	var list = [];

	docks.split(/;|\n|,/).forEach(function(dock) {
		dock = dock.trim();
		if (dock[0] === '#') return;
		list.push(dock);
	});

	return list;
};

var parseEnv = function(env) {
	var map = {};

	env.split(/;|\n|,/).forEach(function(str) {
		str = str.trim();
		if (str[0] === '#') return;
		var i = str.indexOf('=');
		if (i === -1) return;
		var key = str.slice(0, i).trim();
		var val = str.slice(i+1).trim().replace(/(^["'])|(["']$)/g, '');
		if (val) map[key] = val;
		else map[key] = undefined;
	});

	return map;
};

var stringifyEnv = function(map) {
	return Object.keys(map || {}).reduce(function(str, key) {
		return str + key+'='+map[key]+'\n';
	}, '');
};

module.exports = function(id, defaults, opts, done) {
	var ondocks = function(cb) {
		if (!opts.docks) return cb();
		if (typeof opts.docks === 'number') return cb();
		if (opts.docks === true) {
			edit(defaults.docks.join('\n'), id+'-docks', function(err, str) {
				if (err) return done(err);
				opts.docks = parseDocks(str);
				cb();
			});
			return;
		}
		opts.docks = parseDocks(opts.docks || '');
		cb();
	};

	var onenv = function(cb) {
		if (!opts.env) return cb();
		if (opts.env === true) {
			edit(stringifyEnv(defaults.env), id+'-env', function(err, str) {
				if (err) return done(err);
				opts.env = parseEnv(str);
				cb();
			});
			return;
		}
		opts.env = xtend(defaults.env, parseEnv(opts.env || ''));
		cb();
	};

	var onstart = function(cb) {
		if (opts.start !== true) return cb();
		edit(defaults.start || '', id+'-start.sh', function(err, str) {
			if (err) return done(err);
			opts.start = str.trim();
			cb();
		});
	};

	var onbuild = function(cb) {
		if (opts.build !== true) return cb();
		edit(defaults.build || '', id+'-build.sh', function(err, str) {
			if (err) return done(err);
			opts.build = str.trim();
			cb();
		});
	};

	ondocks(function() {
		onenv(function() {
			onstart(function() {
				onbuild(done);
			});
		});
	});
};