var log = require('single-line-log');
var split = require('split');
var fs = require('fs');
var zlib = require('zlib');
var tar = require('tar-fs');
var os = require('os');
var progress = require('progress-stream');
var path = require('path');
var pump = require('pump');
var proc = require('child_process');
var pretty = require('prettysize');
var chalk = require('chalk');
var minimatch = require('minimatch');
var client = require('../');
var ui = require('../lib/ui');

var WS = '                    ';
var noop = function() {};

var findGitRepository = function() {
	var root = path.resolve('/');
	var parent = process.cwd();
	while (parent !== root) {
		if (fs.existsSync(path.join(parent, '.git'))) return parent;
		parent = path.join(parent, '..');
	}
	return null;
};

var gitDescribe = function(cb) {
	proc.exec('git describe --always', function(err, stdout) {
		if (err) return cb();
		cb(stdout.trim());
	});
};

var compileIgnore = function(str) {
	var patterns = str.trim().split('\n')
		.concat('.git', '.svn', '.hg', '.*.swp')
		.map(function(pattern) {
			return minimatch.makeRe(pattern);
		})
		.filter(function(pattern) {
			return pattern;
		});

	return function(filename) {
		filename = path.basename(filename);
		return patterns.some(function(pattern) {
			return pattern.test(filename);
		});
	};
};

var readSync = function(filename) {
	return fs.existsSync(filename) && fs.readFileSync(filename, 'utf-8');
};

module.exports = function(id, opts) {
	if (!id) return ui.error('Service name required');

	var repo = findGitRepository();
	if (repo && repo !== process.cwd() && !opts.force) return ui.error('You are in a git repo but not at the root. Use --force to ignore');

	var ignore = opts.ignore === false ? noop : compileIgnore(readSync('.hmsignore') || readSync('.gitignore') || '');
	var c = client(opts);

	var tmp = path.join(os.tmpDir(), 'hms-'+id+'.tgz');
	var rev = typeof opts.revision === 'string' ? opts.revision : undefined;
	var then = Date.now();

	c.open(); // lets just open the conn right away to speed up things

	console.log('Deploying', path.basename(process.cwd()), 'to', id+'\n');

	log(ui.PROGRESS, 'Uploading', id, chalk.cyan('[>'+WS.slice(1)+'] '));

	var uploading = function(pct, transferred, speed) {
		var arrow = Array(Math.floor(WS.length * pct/100)).join('=')+'>';
		var bar = '['+arrow+WS.slice(arrow.length)+']';

		log((pct === 100 ? ui.SUCCESS : ui.PROGRESS), 'Uploading', id, chalk.cyan(bar), pretty(transferred), '('+pretty(speed)+'/s) ');
	};

	var onuploaderror = function(err) {
		log(ui.ERROR, 'Uploading', id, '('+err.message+') ');
	};

	var ready = function() {
		pump(tar.pack('.', {ignore:ignore}), zlib.createGzip(), fs.createWriteStream(tmp), function(err) {
			if (err) return onuploaderror(err);

			var deploy = c.deploy(id, {revision:rev});
			var unspin;

			var prog = progress({
				time: 250,
				length: fs.statSync(tmp).size
			});

			prog.on('progress', function(data) {
				uploading(data.percentage, data.transferred, data.speed);
			});

			deploy.on('building', function(stream) {
				var nl = split();
				var first = true;
				var wasEmpty = false;

				nl.on('data', function(data) {
					if (first && !data) return;
					if (first) console.log();
					first = false;

					if (!data && !wasEmpty) return wasEmpty = true;

					wasEmpty = false;
					ui.indent(data);
				});

				nl.on('end', function() {
					if (!first) console.log();
				});

				stream.pipe(nl);
			});

			deploy.on('syncing', function() {
				if (unspin) unspin();
				unspin = ui.spin('Syncing', id);
			});

			deploy.on('restarting', function() {
				if (unspin) unspin();
				unspin = ui.spin('Restarting', id);
			});

			deploy.on('success', function() {
				if (unspin) unspin();
				console.log('\nSuccessfully deployed', id, '('+(Date.now()-then)+'ms)');
			});

			pump(fs.createReadStream(tmp), prog, deploy, function(err) {
				if (err) return onuploaderror(err);

				deploy.on('error', function(err) {
					if (unspin) return unspin(err);
					ui.error(err);
				});
			});
		});
	};

	if (rev || !repo) return ready();

	gitDescribe(function(desc) {
		rev = desc;
		ready();
	});
};