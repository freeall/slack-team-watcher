require('load-environment')

const express = require('express')
const bodyParser = require('body-parser')
const { WebClient } = require('@slack/web-api')
const memoize = require('./memoize-async')
const axios = require('axios')
const imgcat = require('imgcat')
const stringReplaceAsync = require('string-replace-async')
const chalk = require('chalk')
const { emojify } = require('node-emoji')
const forwardForever = require('./forward-forever')
const cursor = require('cli-cursor')

const RE_USER = /<@U[A-Z0-9]*>/g
const RE_CHANNEL = /<#C[^\s]*>/g
const RE_URL = /<http.*?>/ig
const RE_BOLD = /\*.*?\*/g
const IGNORE_CHANNELS = process.env.IGNORE_CHANNELS ? process.env.IGNORE_CHANNELS.split(',') : []
const DEBUG = false

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
const getChannel = memoize(channel => slack.conversations.info({ channel }))
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
  const isMessage = type === 'event_callback' && event.type === 'message'
  const isPostedByBot = event.subtype === 'bot_message' || !!event.bot_id || (event.message && event.message.bot_id)
  const isUserMessage = isMessage && !event.hidden && !isPostedByBot
  const isBotMessage = isMessage && !event.hidden && isPostedByBot
  const isEditedUserMessage = isMessage && event.hidden && !isPostedByBot && event.subtype === 'message_changed'
  const isEditedBotMessage = isMessage && event.hidden && isPostedByBot && event.subtype === 'message_changed'
  const isRemovedMessage = isMessage && event.subtype === 'message_deleted'
  const isProbablyUnfurledLink = isMessage && event.hidden && event.message && event.message.attachments
  const shouldBeIgnored = isRemovedMessage && !event.previous_message

  if (isUrlVerification) return res.send(challenge)

  res.send('ok')

  if (DEBUG) console.log(`[New event] ${JSON.stringify(event)}`)

  try {
    if (shouldBeIgnored) return
    if (isUserMessage) return await onUserMessage({ event, edited: false })
    if (isBotMessage) return await onBotMessage({ event, edited: false })
    if (isEditedUserMessage) return await onUserMessage({ event, edited: true })
    if (isEditedBotMessage) return await onBotMessage({ event, edited: true })
    if (isRemovedMessage) return await onRemovedMessage({ event })
    if (isProbablyUnfurledLink) return await onAttachments(event.message.attachments)

    console.warn('DID NOT UNDERSTAND SLACK EVENT:', JSON.stringify(slackEvent))
  } catch (err) {
    console.error('Error parsing:', JSON.stringify(slackEvent))
    throw err
  }
})

async function onMessage({ nameStr, profileImage, event, edited, removed }) {
  if (DEBUG) console.log(`[onMessage] Edited=${edited}`)

  const files = edited ? event.message.files : event.files
  const attachments = edited ? event.message.attachments : event.attachments
  const { channel } = await getChannel(event.channel)

  if (isIgnoredChannel(channel.name)) return

  const profileImageAsStr = await imgcat(profileImage, { height: 2, preserveAspectRatio: true })
  const images = files && await Promise.all(files
    .filter(({ filetype: type }) => type === 'png' || type === 'gif' || type === 'jpg')
    .map(async ({ url_private }) => await getPrivateImage(url_private)))

  const text = edited
    ? event.message.text
    : removed
      ? event.previous_message.text
      : event.text
  const clientMessageId = edited ? event.message.client_msg_id : event.client_msg_id
  const isNewMessage = !previousMessages[clientMessageId]
  const hasTextUpdated = !isNewMessage && previousMessages[clientMessageId].text !== text
  const hasUpdatedRecently = !isNewMessage && Date.now() - previousMessages[clientMessageId].timestamp < 60000
  const hasAttachments = !!attachments
  const hasImages = !!images

  if (DEBUG) console.log(`[onMessage] clientMessageId=${clientMessageId} hasTextUpdated=${hasTextUpdated} hasUpdatedRecently=${hasUpdatedRecently} hasAttachments=${hasAttachments} hasImages=${hasImages}`)

  previousMessages[clientMessageId] = { text, timestamp: Date.now() }

  // Write the message (and who wrote it) if
  // - the text has updated, or it it's too long since the original message was changed.
  // - it's too long since the original message(and poster) was shown [this is usually behaviors of Slack apps, so it's a way to shown who posted something, even though it's tehnically just an 'update' to a message]
  if (hasTextUpdated || !hasUpdatedRecently) {
    const prettifiedText = await replaceUserIds(replaceChannelIds(replaceUrls(replaceBold(emojify(text)))))
    console.log(`${profileImageAsStr}[${channelToStr(channel.name)} ${nameStr}] ${prettifiedText} ${ (text && edited) ? chalk.bgWhite.black('(edited)') : ''} ${ removed ? chalk.bgWhite.black('(removed)') : ''}`)
  }

  // if (hasAttachments && !hasTextUpdated) await onAttachments(attachments)
  if (hasAttachments) await onAttachments(attachments)
  if (hasImages && !edited) images.forEach(({ data: image }) => imgcat(image, { log: true, width: '50%', height: '50%' }))
}

async function onBotMessage({ event, edited }) {
  if (DEBUG) console.log(`[onBotMessage]`)

  const botId = event.bot_id || (event.message && event.message.bot_id)
  const { bot } = await getBot(botId)
  const { data: profileImage } = await getPublicImage(bot.icons.image_24 || bot.icons.image_36 || bot.icons.image_48 || bot.icons.image_64 || bot.icons.image_72)
  const nameStr = botToStr(bot.name)

  await onMessage({ nameStr, profileImage, event, edited })
}

async function onUserMessage({ event, edited }) {
  if (DEBUG) console.log(`[onUserMessage] Edited=${edited}`)

  const { user } = await getUser(edited ? event.message.user : event.user)
  const { data: profileImage } = await getPublicImage(user.profile.image_24 || user.profile.image_36 || user.profile.image_48 || user.profile.image_64 || user.profile.image_72)
  const nameStr = userToStr(user.name)

  await onMessage({ nameStr, profileImage, event, edited })
}

async function onRemovedMessage({ event }) {
  if (DEBUG) console.log(`[onRemovedMessage]`)

  const { user } = await getUser(event.previous_message.user)
  const { data: profileImage } = await getPublicImage(user.profile.image_24 || user.profile.image_36 || user.profile.image_48 || user.profile.image_64 || user.profile.image_72)
  const nameStr = userToStr(user.name)

  await onMessage({ nameStr, profileImage, event, removed: true })
}

async function onAttachments(attachments) {
  if (DEBUG && attachments.length) console.log(`[onAttachments] #attachments=${attachments.length}`)

  attachments = await Promise.all(attachments.map(populateAttachment))
  attachments.forEach(async (attachment, i) => {
    const text = attachment.text && attachment.text.trim()
    const hasThumb = !!attachment.thumb
    const hasText = !!text
    const hasImage = !!attachment.image
    const thumbAsStr = hasThumb && await imgcat(attachment.thumb, { height: 2, preserveAspectRatio: true })
    const author = attachment.service_name || attachment.author_name || ''
    const title = chalk.blue.bold(`${author ? `${author} - ` : ''}${attachment.title || ''}`)
    const prettifiedText = await replaceUserIds(replaceChannelIds(replaceUrls(replaceBold(emojify(text || '')))))
    const bar = chalk.bgBlue(' ') + ' '

    if (DEBUG) console.log(`[onAttachments] i=${i} hasText=${hasText} hasImage=${hasImage} hasThumb=${hasThumb} text=${text}`)

    if (hasThumb) console.log(thumbAsStr + title)
    if (!hasThumb) console.log(bar + title)

    if (hasText && hasThumb) console.log(`     ${prettifiedText}`)
    if (hasText && !hasThumb) console.log(bar + prettifiedText)

    if (hasImage) imgcat(attachment.image, { log: true, width: '50%', height: '50%'  })
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

app.listen(3030)

forwardForever(process.env.FORWARDER_NAME, 3030).then(() => {
  console.log('Slack Team Watcher succesfully started')
  console.log('If no messages are coming in, go to https://api.slack.com/apps -> Slack Team Watcher -> Event Subscription, and turn it off and on again')
})

function onerror(err) {
  const isConnectionRefused = err && err.message && err.message.indexOf('connection refused: localtunnel.me') > -1
  const isTunnelOffline = err && err.message && err.message.indexOf('tunnel server offline') > -1
  const shouldIgnore = isConnectionRefused || isTunnelOffline
  if (shouldIgnore) return

  console.error(`Uncaught error: ${err.stack}`)
}

process.on('uncaughtException', onerror)
process.on('unhandledRejection', onerror)

const isRunningInNodemon = !process.stdin.setRawMode

if (isRunningInNodemon) return

// https://stackoverflow.com/questions/50430908/listen-for-command-ctrl-l-signal-in-terminal
process.stdin.currentLine = ''
process.stdin.setRawMode(true)
process.stdin.on('data', (buf) => {
  const charAsAscii = buf.toString().charCodeAt(0)

  switch (charAsAscii) {
    case 0x03:
      process.kill(process.pid, 'SIGINT')
      break

    case 0x04:
      process.exit(0)
      break

    case 0x0c:
      process.stdout.write('\033c')
      break

    case 0x0d:
      process.stdin.emit('line', process.stdin.currentLine)
      process.stdin.currentLine = ''
      break

    default:
      process.stdin.currentLine += String.fromCharCode(charAsAscii)
      break
  }
})

cursor.hide()
process.on('SIGINT', () => {
  cursor.show()
  process.exit()
})

