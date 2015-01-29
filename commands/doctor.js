var ui = require('../lib/ui')

var path = require('path')
var fs = require('fs')
var HOME = process.env.HOME || process.env.USERPROFILE

module.exports = function (opts) {
  var file = opts.config || path.join(HOME, '.hms.json')

  if (fs.existsSync(file)) {
    try {
      JSON.parse(fs.readFileSync(file, 'utf-8'))
      ui.success('configuration file is sane')
    } catch (err) {
      ui.warning('failed to load configuration file: \n' + err)
    }
  } else {
    ui.warning('no config file found')
  }
}
