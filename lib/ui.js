var log = require('single-line-log');
var chalk = require('chalk');
var tree = require('pretty-tree');

var ERROR = chalk.grey('[')+chalk.red('✘')+chalk.grey(']');
var SUCCESS = chalk.grey('[')+chalk.green('✓')+chalk.grey(']');
var PROGRESS = chalk.grey('[-]');
var INDENT = chalk.grey(' # ');

exports.ERROR = ERROR;
exports.SUCCESS = SUCCESS;
exports.PROGRESS = PROGRESS;
exports.INDENT = INDENT;

exports.error = function(err) {
	console.log(ERROR+' '+(err.message || err));
	process.exit(1);
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

exports.highlight = function() {
	console.log(chalk.yellow(Array.prototype.join.call(arguments, ' ')));
};

exports.spin = function() {
	var message = Array.prototype.join.call(arguments, ' ');
	var states = [chalk.cyan(' .   '), chalk.cyan(' ..  '), chalk.cyan(' ... ')];

	var id = setInterval(function() {
		log(PROGRESS+' '+message+states[0]);
		states.push(states.shift());
	}, 1000);

	log.clear();
	log(PROGRESS+' '+message+'     ');

	return function(err) {
		clearInterval(id);
		if (err) log(ERROR+' '+message+' ('+(err.message || err)+')');
		else log(SUCCESS+' '+message);
		log.clear();
	};
};

exports.tree = function(obj) {
	console.log(tree(obj).trim()+'\n');
};