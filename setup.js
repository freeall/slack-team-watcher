const fs = require('fs')
const express = require('express')
const serveoName = `stw-${Math.random().toString().substr(2)}`
const forwardForver = require('./forward-forever')
const app = express()
const bodyParser = require('body-parser')

app.post('/', bodyParser.json(), async (req, res) => {
  const { body: slackEvent } = req
  const { challenge } = slackEvent
  const isChallenge = !!challenge

  if (isChallenge) {
    res.send(challenge)
    console.log('')
    console.log('Received verification message. Setup will now exit.')
    console.log('')
    console.log('Continue with the installation instructions')
    process.exit(0)
  }
})

app.listen(3030)

fs.writeFileSync('./local.json', `{
  "SERVEO_NAME": "${serveoName}",
  "SLACK_OAUTH_ACCESS_TOKEN": "xoxp-...",
  "SLACK_BOT_USER_OAUTH_ACCESS_TOKEN": "xoxb-...",
  "IGNORE_CHANNELS": [
    "#ignore_this_channel"
  ]
}`)

require('load-environment')

forwardForver(process.env.SERVEO_NAME, 3030)

console.log('Created local.json')
console.log()
console.log(`Now continue with the installation instructions, and use this Request URL when asked: https://${serveoName}.serveo.net`)
console.log()
console.log('...When Slack sends verification message this setup will exit')
