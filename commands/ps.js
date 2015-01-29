var relativeDate = require('relative-date')
var client = require('../')
var ui = require('../lib/ui')

module.exports = function (remote, id, opts) {
  var c = client(remote)

  var filter = function (proc) {
    return !id || proc.id === id
  }

  c.ps(function (err, docks) {
    if (err) return ui.error(err)

    docks.forEach(function (dock) {
      dock.list = dock.list.sort(function (a, b) {
        return a.id.localeCompare(b.id)
      })
      var nodes = dock.list.filter(filter).map(function (proc) {
        var node = {}
        var leaf = {}

        node.label = proc.id
        node.leaf = leaf

        leaf.status = proc.status
        leaf.cwd = proc.cwd

        if (proc.command)  leaf.command = proc.command.join(' ')
        if (proc.revision) leaf.revision = proc.revision
        if (proc.pid)      leaf.pid = proc.pid
        if (proc.started)  leaf.started = relativeDate(proc.started)
        if (proc.deployed) leaf.deployed = relativeDate(proc.deployed)

        if (opts.env && proc.env) leaf.env = proc.env

        return node
      })

      ui.tree({
        label: dock.id,
        nodes: nodes
      })
    })
  })
}
