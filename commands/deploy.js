var log = require('single-line-log');
var unansi = require('ansi-stripper');
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
var logStream = require('../lib/log-stream');

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

module.exports = function(remote, id, opts) {
	if (!id) return ui.error('Service name required');

	var retry = function(isRetrying) {
		var repo = !opts.stdin && !opts.url && findGitRepository();
		if (repo && repo !== process.cwd() && !opts.force) return ui.error('You are in a git repo but not at the root. Use --force to ignore');

		var ignore = opts.ignore === false ? noop : compileIgnore(readSync('.hmsignore') || readSync('.gitignore') || '');
		var c = client(remote);

		var tmp = path.join(os.tmpDir(), 'hms-'+id+'.tgz');
		var rev = typeof opts.revision === 'string' ? opts.revision : undefined;
		var then = Date.now();

		c.open(); // lets just open the conn right away to speed up things

		console.log('Deploying', path.basename(process.cwd()), 'to', id+'\n');

		var uploadSucceded = false;

		var uploading = function(pct, transferred, speed) {
			if (uploadSucceded) return;
			uploadSucceded = pct === 100;

			if (!ui.TTY && uploadSucceded) return console.log(ui.SUCCESS, 'Uploading', id);
			if (!ui.TTY) return;

			var arrow = Array(Math.floor(WS.length * pct/100)).join('=')+'>';
			var bar = '['+arrow+WS.slice(arrow.length)+']';

			log((uploadSucceded ? ui.SUCCESS : ui.PROGRESS), 'Uploading', id, chalk.cyan(bar), pretty(transferred), '('+pretty(speed)+'/s) ');
		};

		var onuploaderror = function(err) {
			(ui.TTY ? log : console.log)(ui.ERROR, 'Uploading', id, '('+err.message+') ');
			process.exit(1);
		};

		var onopen = function() {
			var unspin = ui.spin('Connecting to remote');
			c.open(function(err) {
				if (err) return unspin(err);
				c.subscribe(id, function(err) {
					if (err) return unspin(err);
					unspin();
					onupload();
				});
			});
		};

		var onfile = function() {
			var unspin = ui.spin('Extracting tarball from', opts.file);
			pump(fs.createReadStream(opts.file), fs.createWriteStream(tmp), function(err) {
				if (err) return unspin(err);
				unspin();
				onopen();
			});
		};

		var onurl = function() {
			var unspin = ui.spin('Downloading tarball from', opts.url);
			pump(request(opts.url), fs.createWriteStream(tmp), function(err) {
				if (err) return unspin(err);
				unspin();
				onopen();
			});
		};

		var onstdin = function() {
			var unspin = ui.spin('Reading tarball from stdin');

			if (isRetrying) {
				unspin();
				onopen();
				return;
			}

			pump(process.stdin, fs.createWriteStream(tmp), function(err) {
				if (err) return unspin(err);
				unspin();
				onopen();
			});
		};

		var ontar = function() {
			var unspin = ui.spin('Creating tarball');
			pump(tar.pack('.', {ignore:ignore}), zlib.createGzip(), fs.createWriteStream(tmp), function(err) {
				if (err) return unspin(err);
				unspin();
				onopen();
			});
		};

		var onupload = function() {
			if (ui.TTY) log(ui.PROGRESS, 'Uploading', id, chalk.cyan('[>'+WS.slice(1)+'] '));
			else console.log(ui.PROGRESS, 'Uploading', id);

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
					var isEmpty = !unansi(data).trim();

					if (first && isEmpty) return;
					if (first) console.log();
					first = false;

					if (isEmpty && !wasEmpty) return wasEmpty = true;

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

			var logs;

			deploy.on('restarting', function() {
				if (unspin) unspin();
				c.subscribe(id);
				unspin = ui.spin('Restarting', id);
				logs = logStream(c);
			});

			deploy.on('success', function() {
				c.ps(function(err, ps) {
					if (unspin && err) return unspin(err);
					if (unspin) unspin(err);
					if (!logs || opts.log === false) return process.exit(0);

					var running = ps.some(function(dock) {
						return (dock.list || []).some(function(proc) {
							return proc.status !== 'stopped' && proc.id === id;
						});
					});

					if (!running) return ui.error('Service does not match any docks. Exiting...\n');

					console.log('\nForwarding', id, 'output\n');
					logs.pipe(process.stdout);
				});
			});

			pump(fs.createReadStream(tmp), prog, deploy, function(err) {
				if (err) return onuploaderror(err);

				deploy.on('error', function(err) {
					if (unspin) return unspin(err);
					ui.error(err);
					process.exit(1);
				});
			});
		};

		if (opts.file) return onfile();
		if (opts.url) return onurl();
		if (opts.stdin) return onstdin();
		if (rev || !repo) return ontar();

		gitDescribe(function(desc) {
			rev = desc;
			ontar();
		});
	};

	if (opts.retry) {
		var tries = 5;
		var exit = process.exit;

		process.exit = function(code) {
			if (!code) return exit(code);
			if (!tries--) return exit(code);
			console.log('\nCommand failed! Retrying '+(5-tries)+'/5 ...\n');
			setTimeout(retry.bind(null, true), 1000);
		};
	}

	retry();
};