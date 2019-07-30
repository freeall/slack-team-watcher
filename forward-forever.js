const localtunnel = require('localtunnel')

module.exports = startTunnel

function startTunnel(subdomain, localPort) {
  let firstConnection = true

  const tunnel = localtunnel(localPort, { subdomain }, (err, tunnel) => {
    if (err) return console.error(`[FORWARDER] Error while starting tunnel ${tunnel}. You will probably need to restart. ${err.stack}`)
    if (!firstConnection) console.log('[FORWARDER] Tunnel restarted. Now forwarding Slack messages again')
    firstConnection = false
  })

  function shouldRestart(err) {
    const shouldIgnore = err && err.message && err.message.indexOf('connection refused: localtunnel.me') > -1

    if (err && !shouldIgnore) console.error(`[FORWARDER] Error from forwarder: ${err.message}`)
    tunnel.close()
  }

  tunnel.once('error', shouldRestart)
  tunnel.once('dead', shouldRestart)
  tunnel.once('close', () => {
    tunnel.off('error', shouldRestart)
    tunnel.off('dead', shouldRestart)

    console.error('[FORWARDER] Tunnel closed. Trying to restart it')
    startTunnel(subdomain, localPort)
  })
}
