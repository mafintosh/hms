var fs = require('fs');
var path = require('path');

var HOME = process.env.HOME || process.env.USERPROFILE;
var HMS = path.join(HOME, '.hms.json');

exports.read = function() {
	return fs.existsSync(HMS) ? require(HMS) : {};
};

exports.write = function(val) {
	fs.writeFileSync(HMS, JSON.stringify(val || {}, null, 2)+'\n');
};

exports.cache = function(key, val) {
	if (!key) key = 'default';

	var conf = exports.read();
	var entry = conf.cache && conf.cache[key];

	if (arguments.length > 1) {
		conf.cache = conf.cache || {};
		conf.cache[key] = entry = {expires:Date.now() + 24 * 3600000, value:val};
		if (!val) delete conf.cache[key];
		exports.write(conf);
	}

	return entry && entry.expires > Date.now() && entry.value;
};