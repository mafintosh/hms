var xtend = require('xtend');
var edit = require('string-editor');

var parse = function(env) {
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

var stringify = function(map) {
	return Object.keys(map || {}).reduce(function(str, key) {
		return str + key+'='+map[key]+'\n';
	}, '');
};

module.exports = function(id, defaults, opts, done) {
	var ontags = function(cb) {
		if (!opts.tags) return cb();
		if (opts.tags === true) {
			edit(stringify(defaults.tags), id+'-tags', function(err, str) {
				if (err) return done(err);
				opts.tags = parse(str);
				cb();
			});
			return;
		}
		opts.tags = xtend(defaults.tags, parse(opts.tags || ''));
		cb();
	};

	var onenv = function(cb) {
		if (!opts.env) return cb();
		if (opts.env === true) {
			edit(stringify(defaults.env), id+'-env', function(err, str) {
				if (err) return done(err);
				opts.env = parse(str);
				cb();
			});
			return;
		}
		opts.env = xtend(defaults.env, parse(opts.env || ''));
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

	ontags(function() {
		onenv(function() {
			onstart(function() {
				onbuild(done);
			});
		});
	});
};