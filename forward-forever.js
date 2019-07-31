const localtunnel = require('localtunnel')

module.exports = startTunnel

function startTunnel(subdomain, localPort) {
  let firstConnection = true

  const tunnel = localtunnel(localPort, { subdomain }, (err, tunnel) => {
    if (!err) return
    console.error(`[FORWARDER] Error while starting tunnel ${tunnel}. You will probably need to restart. ${err.stack}`)
  })

  function shouldRestart(err) {
    const isConnectionRefused = err && err.message && err.message.indexOf('connection refused: localtunnel.me') > -1
    const isTunnelOffline = err && err.message && err.message.indexOf('tunnel server offline') > -1
    const shouldIgnore = isConnectionRefused || isTunnelOffline

    if (err && !shouldIgnore) console.error(`[FORWARDER] Error from forwarder: ${err.message}`)
    tunnel.close()
  }

  tunnel.on('url', () => {
    if (!firstConnection) console.log('[FORWARDER] Tunnel restarted. Now forwarding Slack messages again')
    firstConnection = false
  })

  tunnel.once('error', shouldRestart)
  tunnel.once('dead', shouldRestart)
  tunnel.once('close', () => {
    tunnel.off('error', shouldRestart)
    tunnel.off('dead', shouldRestart)

    console.error('[FORWARDER] Tunnel closed. Trying to restart it')
    startTunnel(subdomain, localPort)
  })
}
