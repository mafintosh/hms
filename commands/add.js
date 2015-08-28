var client = require('../')
var ui = require('../lib/ui')
var updateable = require('../lib/updateable')

var help = 'You need to specify the following properties\n' +
      '--start [start-script]'

module.exports = function (remote, id, opts) {
  if (!id) return ui.error('Service name required')
  if (!opts.start && opts.start !== false) return ui.error(help)

  var c = client(remote, {key: opts.key})
  var unspin = ui.spin('Adding', id)

  updateable(id, {}, opts, function (err) {
    if (err) return unspin(err)

    opts.tags = [].concat(opts.tag || [])
    delete opts.tag

    c.add(id, opts, unspin)
  })
}
