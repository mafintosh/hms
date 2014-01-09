var root = require('root');
var multiplex = require('multiplex');
var JSONStream = require('JSONStream');
var path = require('path');
var tar = require('tar-fs');
var pump = require('pump');
var zlib = require('zlib');
var proc = require('child_process');
var rimraf = require('rimraf');
var xtend = require('xtend');
var thunky = require('thunky');
var os = require('os');
var fs = require('fs');
var protocol = require('./protocol');
var pkg = require('../package');

module.exports = function(db) {
	var server = root();
	var cache = {};
	var tmp = os.tmpDir();

	server.on('connect', function(request, socket, data) {
		if (!server.listeners('protocol').length) return socket.destroy();

		socket.write(
			'HTTP/1.1 101 Swiching Protocols\r\n'+
			'Upgrade: hms-protocol\r\n'+
			'Connection: Upgrade\r\n\r\n'
		);

		server.emit('protocol', protocol(socket, data));
	});

	server.get('/', function(request, response) {
		response.send({
			name: pkg.name,
			version: pkg.version
		});
	});

	server.get('/{id}.tgz', function(request, response) {
		var id = request.params.id;
		var service = db.get(id);

		if (!service) return response.error(404, 'service not found');
		if (request.query.deployed && server.deployed !== request.query.deployed) return response.error(404, 'deployment not found');

		if (!cache[id]) {
			cache[id] = thunky(function(cb) {
				var filename = path.join(tmp, 'hms-'+id+'.tgz');
				pump(tar.pack(service.cwd), zlib.createGzip(), fs.createWriteStream(filename), function(err) {
					if (err) return cb(err);
					cb(null, filename);
				});
			});
		}

		cache[id](function(err, filename) {
			if (err) return response.error(err);
			pump(fs.createReadStream(filename), response);
		});
	});

	server.put('/{id}.tgz', function(request, response) {
		var id = request.params.id;
		var deployed = request.query.deployed || new Date().toISOString();
		var plex = multiplex();
		var status = JSONStream.stringify();
		var cwd = path.join('builds', id+'@'+deployed);

		var onextracterror = function(err) {
			rimraf(cwd, function() {
				onerror(err);
			});
		};

		var onerror = function(err) {
			onend({type:'error', message:err.message});
		};

		var onend = function(message) {
			status.write(message || {type:'success'});
			status.end();
			plex.end();
		};

		status.pipe(plex.createStream(1));
		plex.pipe(response);

		pump(request, zlib.createGunzip(), tar.extract(cwd), function(err) {
			if (err) return onextracterror(err);
			if (!db.has(id)) return onextracterror(new Error('service not found'));

			var service = db.get(id);

			var onready = function() {
				if (!db.has(id)) return onextracterror(new Error('service not found'));

				service = db.get(id);
				service.deployed = deployed;
				service.cwd = cwd;

				db.put(id, service, function(err) {
					if (err) return onextracterror(err);
					ondistribute();
				});
			};

			var ondistribute = function() {
				var next = function(err) {
					if (err) return onerror(err);
					if (service.start) return onrestart();
					onend();
				};

				if (!server.listeners('distribute').length) return next();

				status.write({type:'distributing'});
				server.emit('distribute', service, next);
			};

			var onrestart = function() {
				var next = function(err) {
					if (err) return onerror(err);
					onend();
				};

				if (!server.listeners('restart').length) return next();

				status.write({type:'restarting'});
				server.emit('restart', service, next);
			};

			var build = service.build;
			if (!build) return onready();

			var stream = plex.createStream(2);
			var child = proc.spawn('/bin/sh', ['-c', build, id], {cwd:cwd, env:xtend(process.env, service.env)});

			child.stdout.pipe(stream, {end:false});
			child.stderr.pipe(stream, {end:false});

			child.on('error', function(err) {
				stream.end();
				onextracterror(err);
			});

			child.on('close', function(code) {
				stream.end();
				if (code) return onextracterror(new Error('non-zero exit code ('+code+')'));
				onready();
			});
		});
	});

	return server;
};

