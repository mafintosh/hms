var protocol = require('hms-protocol');
var pump = require('pump');
var pingable = require('pingable');

var wrap = function(socket, data) {
	var p = protocol();

	process.nextTick(function() {
		if (data) p.write(data);
		pingable(p);
		socket.setNoDelay(true);
		pump(socket, p, socket, function() {
			p.destroy();
		});
	});

	return p;
};

wrap.version = protocol.version;

module.exports = wrap;