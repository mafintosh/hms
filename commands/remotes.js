var xtend = require('xtend');
var knownHosts = require('known-hosts');
var read = require('read');
var path = require('path');
var select = require('select-keys');
var fs = require('fs');
var ui = require('../lib/ui');
var remotes = require('../lib/remotes');
var client = require('../');

var isKnownHost = function(host, fingerprint) {
	host = host.split('@').pop();
	return knownHosts.some(function(entry) {
		return entry.host === host && entry.fingerprint === fingerprint;
	});
};

module.exports = function(cmd, remote, url, opts) {
	var conf = xtend(remotes.read(remote) || {}, opts);

	var remove = function() {
		if (!remote) return ui.error('Remote is required');

		var r = remotes.read(remote);
		if (!r) return ui.error('Remote not found');
		remotes.remove(remote);
		ui.success('Remote was removed');
	};

	var list = function() {
		var l = remotes.list();

		if (!l.length) return ui.empty();

		l.forEach(function(name) {
			ui.tree({
				label: name,
				leaf: remotes.read(name)
			});
		});
	};

	var add = function() {
		if (!remote) return ui.error('Remote is required');
		if (!url) return ui.error('Remote url is required');
		if (conf.key && !fs.existsSync(conf.key)) return ui.error('Key file does not exist');
		if (conf.key) conf.key = fs.realpathSync(conf.key);

		var oldFingerprint = conf.fingerprint;
		delete conf.fingerprint;

		var c = client(url, conf);

		c.on('verify', function(fingerprint, cb) {
			conf.fingerprint = fingerprint;

			var next = function(err) {
				console.log('');
				cb(err);
			};

			if (fingerprint === oldFingerprint || opts.yes) {
				console.log('Remote is already verified.')
				return next();
			}
			if (isKnownHost(url, fingerprint)) {
				console.log('Remote is verified by ~/.ssh/known_hosts.');
				return next();
			}

			console.log('Remote rsa fingerprint is: '+fingerprint);
			read({prompt: 'Do you want to continue (yes/no)? '}, function onanswer(err, answer) {
				if (err) return ui.error(err);
				if (answer === 'no') return next(new Error('Host could not be verified'));
				if (answer === 'yes') return next();
				read({prompt:'Please type \'yes\' or \'no\': '}, onanswer);
			});
		});

		c.list(function(err) {
			if (err) return ui.error(err);

			conf.url = url;
			conf = select(conf, ['url', 'key', 'passphrase', 'fingerprint']);

			ui.tree({
				label: remote,
				leaf: conf
			});

			remotes.write(remote, conf);
		});
	};

	if (cmd === 'add') return add();
	if (cmd === 'remove') return remove();

	list();
};