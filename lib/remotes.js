var path = require('path');
var fs = require('fs');

var HOME = process.env.HOME || process.env.USERPROFILE;
var FILE = path.join(HOME, '.hms.json');

module.exports = function(file) {
	if (!file) file = FILE

	var that = {}

	var cache;
	var read = function() {
		if (cache) return cache;

		try {
			cache = JSON.parse(fs.readFileSync(file, 'utf-8'));
		} catch (err) {
			cache = {};
		}

		return cache;
	};

	that.has = function(name) {
		return !!read()[name];
	};

	that.read = function(name) {
		return read()[name];
	};

	that.remove = function(name) {
		that.write(name, null);
	};

	that.cache = function(name, key, val) {
		var conf = read();
		var opts = conf[name] || {};

		var entry = opts.cache && opts.cache[key] || {};
		if (arguments.length === 2 && entry.expires > Date.now()) return entry.value;

		entry.expires = Date.now() + 24 * 3600 * 1000;
		entry.value = val;

		opts.cache = opts.cache || {};
		opts.cache[key] = entry;

		if (!entry.value) delete opts.cache[key];
		if (conf[name]) that.write(name, opts);

		return entry.value;
	};

	that.write = function(name, opts) {
		var conf = read();
		conf[name] = opts || undefined;
		fs.writeFileSync(file, JSON.stringify(conf, null, 2)+'\n');
		return conf[name];
	};

	that.list = function() {
		return Object.keys(read());
	};

	return that
}
