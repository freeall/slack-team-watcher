const fs = require('fs')
const express = require('express')
const forwardForever = require('./forward-forever')

const forwarderName = `stw-${Math.random().toString().substr(2)}`
const app = express()
const bodyParser = require('body-parser')
const { start } = require('repl')

app.post('/', bodyParser.json(), async (req, res) => {
  const { body: slackEvent } = req
  const { challenge } = slackEvent
  const isChallenge = !!challenge

  if (isChallenge) {
    res.send(challenge)
    console.log('>')
    console.log('> Received verification message. Setup will now exit.')
    console.log('> Continue with the rest of the installation instructions')

    setTimeout(() => process.exit(0), 2000)
  }
})

app.listen(3030)

fs.writeFileSync('./local.json', `{
  "FORWARDER_NAME": "${forwarderName}",
  "SLACK_OAUTH_ACCESS_TOKEN": "xoxp-...",
  "SLACK_BOT_USER_OAUTH_ACCESS_TOKEN": "xoxb-...",
  "IGNORE_CHANNELS": [
    "#ignore_this_channel"
  ]
}`)

require('load-environment')

console.log('> Created local.json')
console.log('> Waiting for forwarding tunnel...')

start()

forwardForever(process.env.FORWARDER_NAME, 3030).then(() => {
  console.log('> Tunnel ready')
  console.log('>')
  console.log(`> Now continue with the installation instructions, and use this Request URL when asked: https://${forwarderName}.loca.lt`)
  console.log('>')
  console.log('> When Slack sends verification message this setup will exit...')
})
