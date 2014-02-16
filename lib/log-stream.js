var chalk = require('chalk');
var stream = require('stream');

var padder = function() {
	var ws = ' ';
	return function(msg) {
		if (msg.length >= ws.length) ws = msg.replace(/./g, ' ')+' ';
		return msg+ws.slice(msg.length - ws.length);
	};
};

module.exports = function(c) {
	var padOrigin = padder();
	var padId = padder();
	var output = new stream.PassThrough();

	var align = function(id, origin, data) {
		data.toString().trim().split('\n').forEach(function(line) {
			output.write(chalk.yellow(padId(id))+chalk.grey(padOrigin(origin))+line+'\n');
		});
	};

	c.on('stdout', function(id, origin, data) {
		align(id, origin, data);
	});

	c.on('stderr', function(id, origin, data) {
		align(id, origin, data);
	});

	c.on('spawn', function(id, origin, pid) {
		align(id, origin, chalk.cyan('Process spawned with pid '+pid));
	});

	c.on('exit', function(id, origin, code) {
		align(id, origin, chalk.cyan('Process exited with code '+code));
	});

	return output;
};