var client = require('../')
var ui = require('../lib/ui')
var updateable = require('../lib/updateable')
var logStream = require('../lib/log-stream')

var undef = function () {
  return Array.prototype.every.call(arguments, function (arg) {
    return arg === undefined
  })
}

var help = 'You need to specify one (or more) of the following\n' +
  '--start [start-script]\n' +
  '--build [build-script]\n' +
  '--tag   [add-a-tag]\n' +
  '--untag [remove-a-tag]\n' +
  '--env   [NAME=var,NAME2=var2]'

module.exports = function (remote, id, opts) {
  if (!id) return ui.error('Service name required')
  if (!opts.force && undef(opts.env, opts.tag, opts.untag, opts.start, opts.limit, opts.build)) return ui.error(help)

  var c = client(remote)
  var unspin = ui.spin('Updating', id)
  var untags = [].concat(opts.untag || [])

  var done = function (err) {
    if (err) return unspin(err)

    c.update(id, opts, function (err) {
      unspin(err)
      if (!opts.restart) return
      unspin = ui.spin('Restarting', id)
      c.restart(id, function (err) {
        unspin(err)
        if (opts.log === false) return
        console.log('\nForwarding', id, 'output\n')
        logStream(c).pipe(process.stdout)
      })
    })
  }

  if (!opts.env && !opts.tag && !opts.untag && !opts.start && !opts.build) return done()

  c.get(id, function (err, service) {
    if (err) return done(err)

    var tags = {}

    service.tags || [].concat(opts.tag || []).forEach(function (tag) {
      if (untags.indexOf(tag) === -1) tags[tag] = 1
    })

    opts.tags = Object.keys(tags)
    delete opts.tag

    updateable(id, service, opts, done)
  })
}
