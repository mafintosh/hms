var http = require('http')
var root = require('root')
var flat = require('flat-file-db')
var path = require('path')
var fs = require('fs')
var tar = require('tar-fs')
var zlib = require('zlib')
var os = require('os')
var xtend = require('xtend')
var rimraf = require('rimraf')
var once = require('once')
var pump = require('pump')
var select = require('select-keys')
var shell = require('shell-quote')
var respawns = require('respawn-group')
var protocol = require('../lib/protocol')
var parse = require('../lib/parse-remote')
var subscriptions = require('../lib/subscriptions')
var pkg = require('../package.json')
var generateLogger = require('log-with-namespace-and-date-stamp')

var noop = function () {}

var HANDSHAKE =
  'HTTP/1.1 101 Swiching Protocols\r\n' +
  'Upgrade: hms-protocol\r\n' +
  'Connection: Upgrade\r\n\r\n'

var log = generateLogger('dock')

module.exports = function (remote, opts) {
  var server = root()
  var db = flat.sync(opts.db || 'dock.db')
  var mons = respawns()
  var subs = subscriptions()
  var tags = [].concat(opts.tag || [])

  var me = {
    type: 'dock',
    version: pkg.version,
    id: opts.id || os.hostname(),
    tags: tags,
    default: !!opts.default
  }

  subs.on('subscribe', function (id, protocol, count) {
    if (count > 1) return
    log('forwarding events and output', [id])
  })

  subs.on('unsubscribe', function (id, protocol, count) {
    if (count) return
    log('unforwarding event and output', [id])
  })

  mons.on('finalize', function (mon) {
    var cwd = db.has(mon.id) && db.get(mon.id).cwd
    if (mon.cwd !== cwd) rimraf(mon.cwd, noop)
  })

  mons.on('stdout', function (mon, data) {
    subs.publish('stdout', mon.id, me.id, data)
  })

  mons.on('stderr', function (mon, data) {
    subs.publish('stderr', mon.id, me.id, data)
  })

  mons.on('spawn', function (mon, child) {
    log('spawned ' + child.pid, [mon.id])
    subs.publish('spawn', mon.id, me.id, child.pid)
  })

  mons.on('exit', function (mon, code) {
    log('exited (' + code + ')', [mon.id])
    subs.publish('exit', mon.id, me.id, code)
  })

  remote = parse(xtend(remote))
  var info = {}

  var validService = function (service) {
    var tags = service.tags || []
    if (!tags.length && opts.default) return true
    return [me.id].concat(me.tags).some(function (tag) {
      return tags.indexOf(tag) > -1
    })
  }

  var onmon = function (id, service) {
    if (!service.start || !service.cwd) return false

    var env = xtend({SERVICE_NAME: id}, service.env)
    var stale = mons.get(id) || {}
    var cmd = shell.parse(service.start, env)
    var fresh = {command: cmd, cwd: service.cwd, env: env}

    if (JSON.stringify({command: stale.command, cwd: stale.cwd, env: stale.env}) === JSON.stringify(fresh)) return false

    info[id] = {revision: service.revision, deployed: service.deployed}
    mons.add(id, fresh)
    return true
  }

  var onstatuschange = function (id, status, cb) {
    var s = db.get(id)
    onmon(id, s)

    var ondone = function () {
      if (!db.has(id)) return cb()
      var s = db.get(id)
      s.stopped = status === 'stop'
      db.put(id, s, cb)
    }

    switch (status) {
      case 'start':
        log('starting process', [id])
        if (validService(s)) mons.start(id)
        return ondone()

      case 'restart':
        log('restarting process', [id])
        if (validService(s)) mons.restart(id)
        return ondone()

      case 'stop':
        log('stopping process', [id])
        return mons.stop(id, ondone)

      default:
    }
  }

  var onprotocol = function (protocol, docking) {
    var onnotfound = function (cb) {
      return docking ? cb() : cb(new Error('Service not found'))
    }

    protocol.on('get', function (id, cb) {
      if (!db.has(id)) return onnotfound(cb)
      cb(null, db.get(id))
    })

    protocol.on('sync', function (id, service, cb) {
      if (!docking) return cb(new Error('Cannot sync from a dock'))
      if (!service) return cb(new Error('Service must be passed'))

      var cwd = path.join('builds', id + '@' + service.deployed).replace(/:/g, '-')

      var onerror = function (err) {
        log('sync failed (' + err.message + ')', [id])
        rimraf(cwd, function () {
          cb(err)
        })
      }

      var done = once(function (err) {
        if (err) return onerror(err)
        log('sync succeded', [id])
        cb()
      })

      var upsert = function () {
        service.cwd = cwd
        db.put(id, service, done)
      }

      fs.exists(cwd, function (exists) {
        if (exists) return upsert()

        var req = http.get(xtend(remote, {
          path: '/' + id,
          headers: {origin: me.id}
        }))

        log('fetching build from remote', [id])
        req.on('error', done)
        req.on('response', function (response) {
          if (response.statusCode !== 200) return done(new Error('Could not fetch build'))
          pump(response, zlib.createGunzip(), tar.extract(cwd, {readable: true}), function (err) {
            if (err) return done(err)
            upsert()
          })
        })
      })
    })

    protocol.on('list', function (cb) {
      var list = db.keys().map(function (key) {
        return db.get(key)
      })

      cb(null, list)
    })

    protocol.on('remove', function (id, cb) {
      if (!docking) return cb(new Error('Cannot remove on a dock'))

      log('stopping and removing process', [id])
      mons.remove(id, function () {
        db.del(id, cb)
      })
    })

    protocol.on('update', function (id, opts, cb) {
      if (!docking) return cb(new Error('Cannot update on a dock'))
      if (!db.has(id)) return onnotfound(cb)
      log('updating process', [id])
      db.put(id, xtend(db.get(id), select(opts, ['start', 'build', 'env', 'docks'])), cb)
    })

    protocol.on('restart', function (id, cb) {
      if (!db.has(id)) return onnotfound(cb)
      onstatuschange(id, 'restart', cb)
    })

    protocol.on('start', function (id, cb) {
      if (!db.has(id)) return onnotfound(cb)
      onstatuschange(id, 'start', cb)
    })

    protocol.on('stop', function (id, cb) {
      if (!db.has(id)) return onnotfound(cb)
      onstatuschange(id, 'stop', cb)
    })

    protocol.on('ps', function (cb) {
      var list = mons.list().map(function (mon) {
        return xtend(mon.toJSON(), {tags: db.get(mon.id).tags || []}, info[mon.id])
      })
      cb(null, [{id: me.id, tags: me.tags, list: list}])
    })

    protocol.on('subscribe', function (id, cb) {
      if (!docking && id !== '*' && !db.has(id)) return onnotfound(cb)
      subs.subscribe(id, protocol)
      cb()
    })

    protocol.once('subscribe', function () {
      protocol.on('close', function () {
        subs.clear(protocol)
      })
    })

    protocol.on('unsubscribe', function (id, cb) {
      subs.unsubscribe(id, protocol)
      cb()
    })
  }

  var dropped = true
  var connect = function () {
    var req = http.request(xtend(remote, {
      method: 'CONNECT',
      headers: {
        origin: me.id
      }
    }))

    var reconnect = once(function () {
      if (dropped) return setTimeout(connect, 5000)
      dropped = true
      log('connection to remote dropped')
      setTimeout(connect, 2500)
    })

    req.on('error', reconnect)
    req.on('connect', function (res, socket, data) {
      dropped = false
      log('connection to remote established')
      var p = protocol(socket, data)

      p.on('close', reconnect)
      p.handshake(me, function (err, handshake) {
        if (err) return p.destroy()
        onprotocol(p, true)
      })
    })

    req.end()
  }

  server.get('/', function (req, res) {
    res.end('hms-dock ' + pkg.version + '\n')
  })

  server.error(function (req, res) {
    res.end('Cannot deploy to a dock')
  })

  server.on('connect', function (req, socket, data) {
    socket.write(HANDSHAKE)
    var p = protocol(socket, data)

    p.once('handshake', function (handshake, cb) {
      if (!handshake) handshake = {}
      if (handshake.protocol !== protocol.version) return cb(new Error('Server and client do not speak the same protocol'))

      if (handshake.type === 'client') {
        onprotocol(p, false)
        return cb(null, me)
      }

      cb(new Error('Invalid handshake'))
    })
  })

  var port = opts.port || 10002
  server.listen(port, function (addr) {
    log(me.id, 'listening on', port)

    db.keys().forEach(function (key) {
      var service = db.get(key)
      if (service.stopped) onmon(key, service)
      else onstatuschange(key, 'start', noop)
    })

    connect()
  })

  var shutdown = function () {
    log('shutting down')
    mons.shutdown(function () {
      process.exit(0)
    })
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  process.on('error', function (err) {
    process.stderr.write(err.stack)
    shutdown()
  })
}
