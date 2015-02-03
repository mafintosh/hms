var client = require('../')
var ui = require('../lib/ui')
var relativeDate = require('relative-date')

module.exports = function (remote, id, opts) {
  var connection = client(remote)

  if (id) {
    connection.ps(function (err, docks) {
      if (err) return ui.error(err)

      docks = [].concat(docks).filter(function (dock) { return dock.id === id})[0]

      if (!docks) return ui.error(id + ' does not exist')

      ui.tree({
        label: id,
        nodes: docks.list.reduce(function (acc, service) {
          var leaf = {}
          leaf.status = service.status
          if (docks.hostname) leaf.hostname = docks.hostname
          leaf.cwd = service.cwd

          if (service.command)  leaf.command = service.command.join(' ')
          if (service.revision) leaf.revision = service.revision
          if (service.pid)      leaf.pid = service.pid
          if (service.started)  leaf.started = relativeDate(service.started)
          if (service.deployed) leaf.deployed = relativeDate(service.deployed)
          if (service.tags && service.tags.length) leaf.tags = service.tags.join(', ')
          if (opts.env && service.env) leaf.env = service.env

          acc.push({label: service.id, leaf: leaf})
          return acc
        }, [])
      })
    })
  } else {
    connection.ps(function (err, docks) {
      if (err) return ui.error(err)

      ui.tree({
        label: 'docks',
        nodes: [].concat(docks).map(function (dock) { return dock.id }).sort()
      })
    })
  }
}
