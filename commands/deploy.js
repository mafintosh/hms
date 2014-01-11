var fs = require('fs');
var zlib = require('zlib');
var tar = require('tar-fs');
var os = require('os');
var progress = require('progress-stream');
var path = require('path');
var pump = require('pump');
var client = require('../');
var ui = require('../lib/ui');

module.exports = function(id, opts) {
	if (!id) return ui.error('Service name required');

	var c = client(opts.remote);

	var tmp = path.join(os.tmpDir(), 'hms-'+id+'.tgz');
	var rev = typeof opts.revision === 'string' ? opts.revision : undefined;

	c.open(); // lets just open the conn right away to speed up things

	pump(tar.pack('.'), zlib.createGzip(), fs.createWriteStream(tmp), function(err) {
		var deploy = c.deploy(id, {revision:rev});

		var prog = progress({
			time: 250,
			length: fs.statSync(tmp).size
		});

		deploy.on('error', function(err) {
			ui.error(err);
		});

		pump(fs.createReadStream(tmp), deploy);
	});
};