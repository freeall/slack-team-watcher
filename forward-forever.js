const localtunnel = require('localtunnel')
const EventEmitter = require('events')

module.exports = (subdomain, localPort) => {
  const that = new EventEmitter()
  const tunnel = localtunnel(localPort, { subdomain }, (err, tunnel) => {
    err && console.error(`[FORWARDER] Error: ${err}`)
    that.emit('ready', tunnel.url)
  })
  tunnel.on('close', () => console.error('[FORWARDER] Forwarded messages from Slack may no longer reach you. Please restart Slack Team Watcher'))

  return that
}
