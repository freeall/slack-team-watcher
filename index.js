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
const previousMessages = {}

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

  // console.log(JSON.stringify(event))
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
  const files = edited ? event.message.files : event.files
  const attachments = edited ? event.message.attachments : event.attachments
  const { channel } = await getChannel(event.channel)

  if (isIgnoredChannel(channel.name)) return

  const profileImageAsStr = termImg.string(profileImage, { height: 2, preserveAspectRatio: true })
  const images = files && await Promise.all(files
    .filter(({ filetype: type }) => type === 'png' || type === 'gif' || type === 'jpg')
    .map(async ({ url_private }) => await getPrivateImage(url_private)))

  const text = edited ? event.message.text : event.text
  const clientMessageId = edited ? event.message.client_msg_id : event.client_msg_id
  const hasTextUpdated = previousMessages[clientMessageId] !== text
  const hasAttachments = !!attachments
  const hasImages = !!images

  previousMessages[clientMessageId] = text

  if (hasTextUpdated) {
    const prettifiedText = await replaceUserIds(replaceChannelIds(replaceUrls(replaceBold(emojify(text)))))
    console.log(`${profileImageAsStr}[${channelToStr(channel.name)} ${nameStr}] ${prettifiedText} ${edited ? chalk.bgWhite.black('(edited)') : ''}`)
  }

  if (hasAttachments && !hasTextUpdated) await onAttachments(attachments)
  if (hasImages && !edited) images.forEach(({ data: image }) => termImg(image))
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

async function onAttachments(attachments) {
  attachments = await Promise.all(attachments.map(populateAttachment))
  attachments.forEach(async attachment => {
    const hasThumb = !!attachment.thumb
    const hasText = !!attachment.text
    const hasImage = !!attachment.image

    const thumbAsStr = hasThumb && termImg.string(attachment.thumb, { height: 2, preserveAspectRatio: true })
    const title = chalk.blue.bold(`${attachment.service_name || attachment.author_name || ''}${attachment.title ? ` - ${attachment.title}` : ''}`)
    const text = await replaceUserIds(replaceChannelIds(replaceUrls(replaceBold(emojify(attachment.text || '')))))
    const bar = chalk.bgBlue(' ') + ' '

    if (hasThumb) console.log(thumbAsStr + title)
    if (!hasThumb) console.log(bar + title)

    if (hasText && hasThumb) console.log(`     ${text}`)
    if (hasText && !hasThumb) console.log(bar + text)

    if (hasImage) termImg(attachment.image)
  })
}

async function populateAttachment (attachment) {
  const attachmentThumb = attachment.thumb_url || attachment.service_icon
  const attachmentImage = attachment.image_url
  const hasThumb = !!attachmentThumb
  const hasImage = !!attachmentImage

  if (!hasThumb && !hasImage) return attachment

  if (hasThumb) {
    const { data: thumb } = await getPublicImage(attachmentThumb)
    attachment.thumb = thumb
  }

  if (hasImage) {
    const { data: image } = await getPublicImage(attachmentImage)
    attachment.image = image
  }

  return attachment
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
