# Team Watcher

Have all of your team's public chats running in the CLI. Just for kicks.

Profile pictures, images, gifs, and links are supported.

## Requirements

### iTerm

Other terminals might work, but they would need to support `img-cat`

### imgcat

Team Watcher uses iTerm's `img-cat` to show images, so install that first.

You can do that in iTerm's menu: `iTerm2 -> Install Shell Integration`

Or if you only want `img-cat` you can read about that here: https://www.iterm2.com/documentation-images.html

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
10. Run `node index.js`

Now you should be able to see the messages coming in 🤡
