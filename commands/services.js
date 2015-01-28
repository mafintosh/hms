var ui = require('../lib/ui');
var client = require('../');
var info = require('./info')

module.exports = function(remote, id, opts) {
  if (id) {
    return info(remote, id, opts)
  }

  var connection = client(remote);
  connection.list(function(err, services) {
    if (err) return ui.error(err)

    services = [].concat(services)

    ui.tree({
      label: 'services',
      nodes: services.map(function(service) { return service.id })
    })
  })
};
