# Slack Team Watcher

![Screenshot of Slack Team Watcher](https://github.com/freeall/slack-team-watcher/blob/master/screenshot.png)

Have all of your team's public chats running in the CLI. Just for kicks.

Profile pictures, images, gifs, and links are supported.

## Requirements

### iTerm

iTerm is needed as `Slack Team Watcer` outputs grapics in an iTerm format

## Installation

While there are quite some steps it only takes 1-2 minutes to install.

1. Run `git clone git@github.com:freeall/slack-team-watcher.git`
1. Run `npm install`
2. Run `npm run setup`. A Request URL will be outputted. Note that the setup will not exit until step 5 has completed successfully.
3. Go to https://api.slack.com/apps
4. Create App. Choose any `App Name`. Choose your workspace as the `Development Slack Workspace`
5. Enable event. Request URL should be the one outputted to you in step 2.
6. Subscribe to Workspace Events: `message.channels`
7. Create Bot User: `Team Watcher` / `team_watcher`
8. OAuth Scopes: `channels:history`, `channels:read`, `files:read`, `users:read`
9. Install the app on your team
10. Edit `local.json` and insert the tokens from the Slack app
11. Run `npm run start`

Now you should be able to see the messages coming in 🤡

## If Slack Team Watcher stops working after a while

Sometimes if you've had Slack Team Watcher turned off too long Slack will stop sending events to you. In that case go to https://api.slack.com/apps, find `Slack Team Watcher`, go to `Event Subscriptions` and turn it off and on again.

