var path = require('path');
var fs = require('fs');

var HOME = process.env.HOME || process.env.USERPROFILE;
var FILE = path.join(HOME, '.hms.json');

var cache;
var read = function() {
	if (cache) return cache;
	try {
		return cache = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
	} catch (err) {
		return cache = {};
	}
};

exports.has = function(name) {
	return !!read()[name];
};

exports.read = function(name) {
	return read()[name];
};

exports.remove = function(name) {
	exports.write(name, null);
};

exports.cache = function(name, key, val) {
	var conf = read();
	var opts = conf[name] || {};

	var entry = opts.cache && opts.cache[key] || {};
	if (arguments.length === 2 && entry.expires > Date.now()) return entry.value;

	entry.expires = Date.now() + 24 * 3600 * 1000;
	entry.value = val;

	opts.cache = opts.cache || {};
	opts.cache[key] = entry;

	if (!entry.value) delete opts.cache[key];
	if (conf[name]) exports.write(name, opts);

	return entry.value;
};

exports.write = function(name, opts) {
	var conf = read();
	conf[name] = opts || undefined;
	fs.writeFileSync(FILE, JSON.stringify(conf, null, 2)+'\n');
	return conf[name];
};

exports.list = function() {
	return Object.keys(read());
};