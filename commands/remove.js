var client = require('../');
var ui = require('../lib/ui');

module.exports = function(id, opts) {
	if (!id) return ui.error('Service name required');

	var c = client(opts);
	var unspin = ui.spin('Removing', id);
	c.remove(id, unspin);
};