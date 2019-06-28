# Slack Team Watcher

![Screenshot of Slack Team Watcher](https://github.com/freeall/slack-team-watcher/blob/master/screenshot.png)

Have all of your team's public chats running in the CLI. Just for kicks.

Profile pictures, images, gifs, and links are supported.

## Requirements

### iTerm

iTerm is needed as `Slack Team Watcer` outputs grapics in an iTerm format

## Installation

While there are quite some steps it only takes 1-2 minutes to install.

1. Run `npm run setup`. A Request URL will be outputted. Note that the program will not exit until step 4 has completed successfully.
2. Go to https://api.slack.com/apps
3. Create App. Choose any `App Name`. Choose your workspace as the `Development Slack Workspace`
4. Enable event. Request URL should be the one outputted to you in step 1.
5. Subscribe to Workspace Events: `message.channels`
6. Create Bot User: `Team Watcher` / `team_watcher`
7. OAuth Scopes: `channels:history`, `files:read`
8. Install app on your team
9. Edit `local.json` and insert tokens
10. Run `npm run start`

Now you should be able to see the messages coming in 🤡
