const cp = require('child_process')

// Forwards traffic with Serveo
// Restarts when process closes (which it will if there's not traffic for a longer period)
function runForever(subdomain, localPort) {
  const proc = cp.exec(`ssh -R ${subdomain}:80:localhost:${localPort} serveo.net`)
  proc.on('close', () => runForever(subdomain, localPort))
}

module.exports = runForever
