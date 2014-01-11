var client = require('../');
var ui = require('../lib/ui');

module.exports = function(id, opts) {
	var c = client(opts.remote);

	var onlist = function(err, list) {
		if (err) return ui.error(err);

		[].concat(list).forEach(function(service) {
			var leaf = {};

			if (service.start)    leaf.start = service.start;
			if (service.build)    leaf.build = service.build;
			if (service.revision) leaf.revision = service.revision;
			if (service.docks)    leaf.docks = service.docks;
			if (service.env)      leaf.env = service.env;

			ui.tree({
				label: service.id,
				leaf: leaf
			});
		});
	};

	if (!id) return c.list(onlist);
	c.get(id, onlist);
};