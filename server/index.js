/**
 * HTTP reverse proxy server. Yo dawg, I heard you like HTTP servers, so here
 * is an HTTP server for your HTTP servers.
 */

var auto = require('run-auto')
var config = require('../config')
var cp = require('child_process')
var debug = require('debug')('webtorrent-ww:router')
var downgrade = require('downgrade')
var fs = require('fs')
var http = require('http')
var httpProxy = require('http-proxy')
var https = require('https')
var unlimited = require('unlimited')

unlimited()

var proxy = httpProxy.createProxyServer({
  xfwd: true
})

var httpServer = http.createServer()
var httpsServer = https.createServer({
  key: fs.readFileSync(__dirname + '/../secret/webtorrent.io.key'),
  cert: fs.readFileSync(__dirname + '/../secret/webtorrent.io.chained.crt')
})

function onRequest (req, res) {
  if (req.headers.host === 'tracker.webtorrent.io' ||
      req.headers.host === 'tracker.webtorrent.io:' + config.ports.router.https) {
    proxy.web(req, res, { target: 'http://127.0.0.1:' + config.ports.tracker.http })
  } else if (req.headers.host === 'whiteboard.webtorrent.io' ||
      req.headers.host === 'whiteboard.webtorrent.io:' + config.ports.router.https) {
    proxy.web(req, res, { target: 'http://127.0.0.1:' + config.ports.whiteboard })
  } else {
    proxy.web(req, res, { target: 'http://127.0.0.1:' + config.ports.web })
  }
}

function onUpgrade (req, socket, head) {
  proxy.ws(req, socket, head, { target: 'ws://127.0.0.1:' + config.ports.tracker.http })
}

;[ httpServer, httpsServer ].forEach(function (server) {
  server.on('request', onRequest)
  server.on('upgrade', onUpgrade)
})

var web, tracker

auto({
  httpServer: function (cb) {
    httpServer.listen(config.ports.router.http, config.host, cb)
  },
  httpsServer: function (cb) {
    httpsServer.listen(config.ports.router.https, config.host, cb)
  },
  tracker: function (cb) {
    tracker = spawn(__dirname + '/tracker')
    tracker.on('message', cb.bind(null, null))
  },
  downgrade: ['httpServer', 'httpsServer', 'tracker', function (cb) {
    downgrade()
    cb(null)
  }],
  web: ['downgrade', function (cb) {
    web = spawn(__dirname + '/web')
    web.on('message', cb.bind(null, null))
  }]
}, function (err) {
  debug('listening on %s', JSON.stringify(config.ports.router))
  if (err) throw err
})

function onError (err) {
  console.error(err.stack || err.message || err)
}

function spawn (program) {
  var child = cp.spawn('node', [ program ], {
    stdio: [ process.stdin, process.stdout, process.stderr, 'ipc' ]
  })
  child.on('error', onError)
  return child
}

process.on('uncaughtException', function (err) {
  onError(err)

  // kill all processes in the "process group", i.e. this process and the children
  try {
    process.kill(-process.pid)
  } catch (err) {}
})
