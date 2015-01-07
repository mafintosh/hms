var log = require('single-line-log');
var chalk = require('chalk');
var tree = require('pretty-tree');

var TTY = !!process.stdout.isTTY;

var ERROR = chalk.grey('[')+chalk.red(TTY ? '✘' : '!')+chalk.grey(']');
var WARNING = chalk.grey('[')+chalk.yellow('!')+chalk.grey(']');
var SUCCESS = chalk.grey('[')+chalk.green(TTY ? '✓' : '+')+chalk.grey(']');
var PROGRESS = chalk.grey('[-]');
var INDENT = chalk.grey(' # ');

exports.ERROR = ERROR;
exports.SUCCESS = SUCCESS;
exports.PROGRESS = PROGRESS;
exports.INDENT = INDENT;

exports.TTY = TTY;

exports.error = function(err) {
	console.error(ERROR+' '+(err.message || err).replace(/\n/g, '\n    '));
	process.exit(1);
};

exports.warning = function(err) {
	console.warn(WARNING+' '+(err.message || err).replace(/\n/g, '\n    '));
};

exports.success = function() {
	console.log(SUCCESS+' '+Array.prototype.join.call(arguments, ' '));
};

exports.progress = function() {
	console.log(PROGRESS+' '+Array.prototype.join.call(arguments, ' '));
};

exports.indent = function() {
	console.log(INDENT+' '+Array.prototype.join.call(arguments, ' '));
};

exports.spin = function() {
	var message = Array.prototype.join.call(arguments, ' ');
	var states = [chalk.cyan(' .   '), chalk.cyan(' ..  '), chalk.cyan(' ... '), chalk.cyan('     ')];

	if (!TTY) {
		console.log(PROGRESS+' '+message);
		return function(err) {
			if (!err) return console.log(SUCCESS+' '+message);;
			console.log(ERROR+' '+message+' ('+(err.message || err)+')');
			process.exit(1);
		};
	}

	var id = setInterval(function() {
		log(PROGRESS+' '+message+states[0]);
		states.push(states.shift());
	}, 500);

	log.clear();
	log(PROGRESS+' '+message+'     ');

	return function(err) {
		clearInterval(id);
		if (err) {
			log(ERROR+' '+message+' ('+(err.message || err)+')');
			process.exit(1);
		}
		log(SUCCESS+' '+message);
		log.clear();
	};
};

exports.tree = function(obj) {
	console.log(tree(obj).trim()+'\n');
};

exports.empty = function() {
	console.log(chalk.grey('(empty)'));
};