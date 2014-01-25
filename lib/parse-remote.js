var agent = require('http-ssh-agent');
var xtend = require('xtend');

var DEFAULT_PORT = 10002;

var parse = function(remote, opts) {
	if (!opts) opts = {};
	if (typeof remote !== 'string') return parse(remote && remote.remote || '127.0.0.1', remote);

	var parts = remote.match(/^(?:([^@]+)@)?([^:]+)(?::(?:(\d+)\+)?(\d+))?$/);

	if (parts[1]) {
		opts.type = 'http+ssh';
		opts.agent = agent(xtend(opts, {
			username:parts[1],
			host:parts[2],
			port:parseInt(parts[3] || 22, 10)
		}));
		opts.host = '127.0.0.1';
	} else {
		opts.host = parts[2];
		opts.type = 'http';
	}

	opts.port = parseInt(parts[4] || opts.port || DEFAULT_PORT, 10);

	return opts;
};

module.exports = parse;