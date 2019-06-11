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

// TODO!!!! MULTILINE!!!! eg: foo\nbar\nhere <https:....>

const RE_USER = /<@U[A-Z0-9]*>/g
const RE_CHANNEL = /<#C[^\s]*>/g
const RE_URL = /<http.*?>/ig
const RE_BOLD = /\*.*?\*/g
const IGNORE_CHANNELS = process.env.IGNORE_CHANNELS ? process.env.IGNORE_CHANNELS.split(',') : []

const app = express()
const slack = new WebClient(process.env.SLACK_BOT_USER_OAUTH_ACCESS_TOKEN)

const channelToStr = channel => chalk.red(`#${channel}`)
const userToStr = user => chalk.green.bold(`@${user}`)
const botToStr = bot => `${chalk.green.bold(`@${bot}`)} ${chalk.black.bgWhite('APP')}`
const urlToStr = url => chalk.cyan.underline(url)
const boldToStr = str => chalk.bold(str)
const getUser = memoize(user => slack.users.info({ user }))
const getBot = memoize(bot => slack.bots.info({ bot }))
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
const replaceBold = str => str.replace(RE_BOLD, match => boldToStr(match.substring(1, match.length - 1)))

app.post('/', bodyParser.json(), async (req, res) => {
  const { body: slackEvent } = req
  const { type, challenge, event } = slackEvent

  const isUrlVerification = type === 'url_verification'
  const isUserMessage = type === 'event_callback' && event.type === 'message' && !event.hidden && event.subtype !== 'bot_message'
  const isEditedMessage = type === 'event_callback' && event.type === 'message' && event.hidden && event.subtype === 'message_changed'
  const isBotMessage = type === 'event_callback' && event.type === 'message' && !event.hidden && event.subtype === 'bot_message'
  const isProbablyUnfurledLink = type === 'event_callback' && event.type === 'message' && event.hidden && event.message.attachments

  if (isUrlVerification) return res.send(challenge)

  res.send('ok')

  try {
    if (isUserMessage) return await onUserMessage({ event, edited: false })
    if (isEditedMessage) return await onUserMessage({ event, edited: true })
    if (isBotMessage) return await onBotMessage(event)
    if (isProbablyUnfurledLink) return await onAttachments(event.message.attachments)

    console.log('DID NOT UNDERSTAND SLACK EVENT:', JSON.stringify(slackEvent))
  } catch (err) {
    console.log('Error parsing:', JSON.stringify(slackEvent))
    throw err
  }
})

async function onMessage({ nameStr, profileImage, event, edited }) {
  const files = event.files || []
  const { channel } = await getChannel(event.channel)

  if (isIgnoredChannel(channel.name)) return

  const profileImageAsStr = termImg.string(profileImage, { height: 2, preserveAspectRatio: true })
  const images = await Promise.all(files
    .filter(({ filetype: type }) => type === 'png' || type === 'gif' || type === 'jpg')
    .map(async ({ url_private }) => await getPrivateImage(url_private)))

  const text = await replaceUserIds(replaceChannelIds(replaceUrls(replaceBold(emojify(edited ? event.message.text : event.text)))))

  console.log(`${profileImageAsStr}[${channelToStr(channel.name)} ${nameStr}] ${text} ${edited ? chalk.bgWhite.black('(edited)') : ''}`)
  images.forEach(({ data: image }) => termImg(image))

  if (event.attachments) return onAttachments(event.attachments)
}

async function onBotMessage(event) {
  const { bot } = await getBot(event.bot_id)
  const { data: profileImage } = await getPublicImage(bot.icons.image_24 || bot.icons.image_36 || bot.icons.image_48 || bot.icons.image_64 || bot.icons.image_72)
  const nameStr = botToStr(bot.name)

  await onMessage({ nameStr, profileImage, event })
}

async function onUserMessage({ event, edited }) {
  const { user } = await getUser(edited ? event.message.user : event.user)
  const { data: profileImage } = await getPublicImage(user.profile.image_24 || user.profile.image_36 || user.profile.image_48 || user.profile.image_64 || user.profile.image_72)
  const nameStr = userToStr(user.name)

  await onMessage({ nameStr, profileImage, event, edited })
}

async function onAttachments (attachments) {
  attachments = await Promise.all(attachments.map(async attachment => {
    const attachmentThumb = attachment.image_url || attachment.thumb_url || attachment.service_icon
    const hasThumb = !!attachmentThumb

    if (!hasThumb) return attachment

    const { data: thumb } = await getPublicImage(attachmentThumb)
    attachment.isOnlyImage = !!attachment.image_url
    attachment.thumb = thumb
    return attachment
  }))

  attachments.forEach(async attachment => {
    if (attachment.isOnlyImage) return termImg(attachment.thumb)

    const hasThumb = !!attachment.thumb

    const thumbAsStr = hasThumb && termImg.string(attachment.thumb, { height: 2, preserveAspectRatio: true })
    const title = chalk.blue.bold(`${attachment.service_name || attachment.author_name || ''}${attachment.title ? ` - ${attachment.title}` : ''}`)
    const text = await replaceUserIds(replaceChannelIds(replaceUrls(replaceBold(emojify(attachment.text || '')))))
    const bar = chalk.bgBlue(' ') + ' '
    console.log(bar + (hasThumb ? thumbAsStr + title : title))
    console.log(bar + (hasThumb ? `     ${text}` : text))
  })
}

function isIgnoredChannel(channel) {
  return IGNORE_CHANNELS.find(ignoreChannel => ignoreChannel.replace('#', '').toLowerCase() === channel.toLowerCase())
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
