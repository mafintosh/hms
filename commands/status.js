var relativeDate = require('relative-date');
var client = require('../');
var ui = require('../lib/ui');

module.exports = function(remote, id, opts) {
	var c = client(remote);

	var filter = function(proc) {
		return !id || proc.id === id;
	};

	c.ps(function(err, docks) {
		if (err) return ui.error(err);
    var found = 0;
    
		docks.forEach(function(dock) {
			var status = dock.list.filter(filter).map(function(proc) {
				return proc.status;
			});

      found += status.length

			status.forEach(function(st) {
				if (st === 'crashed') process.exit(1)
			})
		});

    if (!found) process.exit(1)
	});
};
