require('load-environment')

const express = require('express')
const bodyParser = require('body-parser')
const { WebClient } = require('@slack/web-api')
const memoize = require('./memoize-async')
const axios = require('axios')
const termImg = require('term-img')
const stringReplaceAsync = require('string-replace-async')
const chalk = require('chalk')
const { emojify } = require('node-emoji')

const RE_USER = /<@U[A-Z0-9]*>/g
const RE_CHANNEL = /<#C[^\s]*>/g
const RE_URL = /<http[^\s]*>/ig

const app = express()
const slack = new WebClient(process.env.SLACK_BOT_USER_OAUTH_ACCESS_TOKEN)

const channelToStr = channel => chalk.red(`#${channel}`)
const userToStr = user => chalk.green.bold(`@${user}`)
const urlToStr = url => chalk.cyan.underline(url)
const getUser = memoize(user => slack.users.info({ user }))
const getChannel = memoize(channel => slack.channels.info({ channel }))
const getPublicImage = memoize(url => axios({ url, responseType: 'arraybuffer' }))
const getPrivateImage = memoize(url => axios({
  url,
  responseType: 'arraybuffer',
  headers: { Authorization: `Bearer ${process.env.SLACK_OAUTH_ACCESS_TOKEN}` }
}))
const replaceUserIds = str => stringReplaceAsync(str, RE_USER, async match => {
  const id = match.substring(2, match.length - 1)
  const { user } = await getUser(id)
  return userToStr(user.name)
})
const replaceChannelIds = str => str.replace(RE_CHANNEL, match => channelToStr(match.substring(match.indexOf('|') + 1, match.length - 1)))
const replaceUrls = str => str.replace(RE_URL, match => urlToStr(match.substring(1, match.length - 1)))

app.post('/', bodyParser.json(), async (req, res) => {
  const { body: slackEvent } = req
  const { type, challenge, event } = slackEvent

  const isUrlVerification = type === 'url_verification'
  const isMessage = type === 'event_callback' && event.type === 'message' && !event.hidden
  const isProbablyUnfurledLink = type === 'event_callback' && event.type === 'message' && event.hidden && event.message.attachments

  if (isUrlVerification) return res.send(challenge)

  res.send('ok')

  try {
    if (isMessage) return await onMessage(event)
    if (isProbablyUnfurledLink) return await onUnfurledLink(event)

    console.log('DID NOT UNDERSTAND SLACK EVENT:', JSON.stringify(slackEvent))
  } catch (err) {
    console.log('Error parsing:', JSON.stringify(slackEvent))
    throw err
  }
})

async function onMessage (event) {
  const files = event.files || []
  const { user } = await getUser(event.user)
  const { channel } = await getChannel(event.channel)
  const { data: profileImage } = await getPublicImage(user.profile.image_24)
  const profileImageAsStr = termImg.string(profileImage, { height: 2, preserveAspectRatio: true })
  const images = await Promise.all(files
    .filter(({ filetype: type }) => type === 'png' || type === 'gif' || type === 'jpg')
    .map(async ({ url_private }) => await getPrivateImage(url_private)))

  const text = await replaceUserIds(replaceChannelIds(replaceUrls(emojify(event.text))))

  console.log(`${profileImageAsStr}[${channelToStr(channel.name)} ${userToStr(user.name)}] ${text}`)
  images.forEach(({ data: image }) => termImg(image))
}

async function onUnfurledLink(event) {
  const attachments = await Promise.all(event.message.attachments.map(async attachment => {
    const { data: thumb } = await getPublicImage(attachment.image_url || attachment.thumb_url)
    attachment.isImage = !!attachment.image_url
    attachment.thumb = thumb
    return attachment
  }))

  attachments.forEach(attachment => {
    if (attachment.isImage) return termImg(attachment.thumb)

    const thumbAsStr = termImg.string(attachment.thumb, { height: 2, preserveAspectRatio: true })
    console.log(chalk.blue.bold(`${thumbAsStr}${attachment.service_name || ''}${attachment.title ? ` - ${attachment.title}` : ''}`))
    console.log(`     ${chalk.gray(attachment.text || '')}`)
  })
}

app.listen(3030, () => console.log('Started listener on port 3030'))

process.on('uncaughtException', err => console.log('uncaughtException:', err))
process.on('unhandledRejection', err => console.log('unhandledRejection:', err))

const isRunningInNodemon = !process.stdin.setRawMode

if (isRunningInNodemon) return

// https://stackoverflow.com/questions/50430908/listen-for-command-ctrl-l-signal-in-terminal
process.stdin.currentLine = '';
process.stdin.setRawMode(true);
process.stdin.on('data', (buf) => {
  const charAsAscii = buf.toString().charCodeAt(0);

  switch (charAsAscii) {
    case 0x03:
      process.kill(process.pid, 'SIGINT');
      break;

    case 0x04:
      process.exit(0);
      break;

    case 0x0c:
      process.stdout.write('\033c');
      break;

    case 0x0d:
      process.stdin.emit('line', process.stdin.currentLine);
      process.stdin.currentLine = '';
      break;

    default:
      process.stdin.currentLine += String.fromCharCode(charAsAscii);
      break;
  }
});
