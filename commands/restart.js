var client = require('../')
var ui = require('../lib/ui')
var logStream = require('../lib/log-stream')

module.exports = function (remote, id, opts) {
  if (!id) return ui.error('Service name required')

  var c = client(remote, {key: opts.key})
  var out

  var onsync = function () {
    if (opts.log !== false) {
      out = logStream(c)
      c.subscribe(id, function (err) {
        if (err) return ui.error(err)
      })
    }

    var unspin = ui.spin('Restarting', id)
    c.restart(id, function (err) {
      unspin(err)
      if (opts.log === false) return
      console.log('\nForwarding', id, 'output\n')
      out.pipe(process.stdout)
    })
  }

  if (opts.sync === false) return onsync()

  var unspin = ui.spin('Syncing', id)
  c.sync(id, function (err) {
    unspin(err)
    onsync()
  })
}
