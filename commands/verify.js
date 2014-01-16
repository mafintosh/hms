var client = require('../');
var ui = require('../lib/ui');
var chalk = require('chalk');
var read = require('read');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var ini = require('ini');

var HOME = process.env.HOME || process.env.USERPROFILE;
var KNOWN_HOSTS = path.join(HOME, '.ssh', 'known_hosts');

try {
	KNOWN_HOSTS = fs.readFileSync(KNOWN_HOSTS).toString().trim().split('\n').reduce(function(result, line) {
		var i = line.indexOf(' ');
		line.slice(0, i).split(',').forEach(function(host) {
			result[host.trim()] = crypto.createHash('md5').update(line.slice(i+1).split(' ').pop(), 'base64').digest('hex');
		});
		return result;
	}, {});
} catch (err) {
	KNOWN_HOSTS = {};
}

module.exports = function(opts) {
	opts.timeout = 0;

	var r = opts.remote;
	var c = client(opts);

	var save = function(hash, cb) {
		var settings = {};
		var key = 'remote '+r;

		settings[key] = settings[key] || {};
		settings[key].fingerprint = hash;

		console.log(ini.encode(settings));

		cb();
	};

	c.on('verify', function(hash, cb) {
		console.log('Please verify the remote fingerprint:\n');

		ui.tree({
			label: r,
			leaf: {
				fingerprint: hash
			}
		});

		if (KNOWN_HOSTS[r.split('@').pop()] === hash) {
			console.log('Matching key found in ~/.ssh/known_hosts - continuing.');
			return save(hash, cb);
		}

		read({prompt: 'Do you want to continue (yes/no)? '}, function onanswer(err, answer) {
			if (err) return ui.error(err);
			if (answer === 'no') return cb(new Error('Host could not be verified'));
			if (answer === 'yes') return save(hash, cb);

			read({prompt:'Please type \'yes\' or \'no\': '}, onanswer);
		});
	});

	c.list(function(err) {
		if (err) return ui.error(err);
	});
};
