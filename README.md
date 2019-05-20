# Team Watcher

Have all of your team's public chats running in the CLI. Just for kicks.

Profile pictures, images, gifs, and links are supported.

## Requirements

### imgcat in iTerm

Uses iTerms `img-cat`, so install that first.

### Public URL

As Team Watcher uses Slack Events you need to add a public endpoint, e.g. using ngrok.

When started correctly ngrok will output something like this:

`Forwarding                    http://a1b2c3d4.ngrok.io -> http://localhost:3030` <--- the ngrok URL is the important one

## Installation

1. After setting up `ngrok` to forward to port 3030 (or change the port in the source), start by running `yarn start`
2. Create a file called `local.json` in the folder where this `README.md`
3. Go to https://api.slack.com/apps
4. Create App. Choose any `App Name`. Choose your workspace as the `Development Slack Workspace`
5. Enable event. Request URL should be the one `ngrok` gave you, e.g. `http://a1b2c3d4.ngrok.io` (this needs to be verified which is why your app should already be running)
6. Subscribe to Workspace Events: `message.channels`
7. Create Bot User: `Team Watcher` / `team_watcher`
8. OAuth Scopes: `channels:history`, `files:read`
9. Install app on your team
10. Insert tokens into `local.json`, so it will look like:

```
{
  "SLACK_OAUTH_ACCESS_TOKEN": "xoxp-.......",
  "SLACK_BOT_USER_OAUTH_ACCESS_TOKEN": "xoxb-...."
}
```
11. Shut down your app and start it again (so that it can read the tokens)

Now you should be able to see the messages coming in 🤡
