var relativeDate = require('relative-date');
var chalk = require('chalk');
var ui = require('../lib/ui');
var client = require('../');

module.exports = function(remote, id, opts) {
	if (!id) return ui.error('Service name required');
	
	function filter(proc) {
		return !id || proc.id === id;
	};

	var c = client(remote);

	c.get(id, function(err, service) {
		if (err) return ui.error(err);

		var leaf = {};

		if (service.start) leaf.start = service.start;
		if (service.build) leaf.build = service.build;
		if (service.revision) leaf.revision = service.revision;
		if (typeof service.limit === 'number') leaf.limit = service.limit;
		if (service.tags) leaf.tags = service.tags;
		if (service.env) leaf.env = service.env;
		
		c.ps(function(err, docks){
			if (err) return ui.error(err);

			var processes = {};

			docks.forEach(function(dock) {
				dock.list
					.filter(filter)
					.forEach(function(current) {
						var info = {}

						if (current.status) info.status = current.status
						if (current.started) info.started = relativeDate(current.started);
						if (current.deployed) info.deployed = relativeDate(current.deployed);
						if (current.revision) info.revision = current.revision
						info.cwd = current.cwd
						if (current.command) info.command = current.command.join(' ')
						info.env = current.env
						info.pid = current.pid

						processes[dock.id] = info
					})
				;
			})

			leaf.ps = processes;
			
			ui.tree({
				label: service.id,
				leaf: leaf
			});
		});
	});
};
