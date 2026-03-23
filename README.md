# Telegram Instagram & TikTok Downloader Bot

A simple Telegram bot that downloads videos from Instagram (Posts, Reels, TV) and TikTok (including watermarked/non-watermarked handling) and sends them back to the user.

## Features

- **Instagram**: Downloads videos from posts, reels, and IGTV.
- **TikTok**: Downloads videos (prioritizes non-watermarked versions).
- **Efficient**: Downloads locally to a temporary file, sends to Telegram, and immediately deletes the local file to save disk space.

## Prerequisites

- Node.js (v14 or higher recommended)
- A Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd tg-inst-tt-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

Set your Telegram Bot Token using environment variables.

### Using Environment Variables (Recommended)

```bash
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
```

Also supported:
- `OWNER_ID` (optional, default: `861207023`)
- `CONFIG_FILE_PATH` (optional, default: `./config.json`)

## Usage

### Development
Run with nodemon for auto-restarts:
```bash
npm run dev
```

### Production
Start the bot:
```bash
npm start
```

## Docker

Build image:
```bash
docker build -t tg-inst-tt-bot .
```

Run container:
```bash
docker run -d \
  --name tg-inst-tt-bot \
  -e TELEGRAM_BOT_TOKEN="your_bot_token_here" \
  -v $(pwd)/config.json:/app/config.json \
  tg-inst-tt-bot
```

Notes:
- `TELEGRAM_BOT_TOKEN` is required.
- Mounting `config.json` keeps admin mode/whitelist changes persistent across container restarts.
- If your server has DNS issues, pass DNS servers (Cloudflare/Google) in run/compose.

### Docker Compose (Recommended for Coolify)

1. Create env file:
```bash
cp .env.example .env
```

2. Set your token in `.env`.

3. Start:
```bash
docker compose up -d --build
```

4. Logs:
```bash
docker compose logs -f
```

## Coolify Deploy (GitHub)

1. Push this project to GitHub.
2. In Coolify, create a new **Application** from your GitHub repo.
3. Choose **Docker Compose** as build type.
4. Set compose file path: `docker-compose.yml`.
5. Add environment variable in Coolify:
   - `TELEGRAM_BOT_TOKEN` (required)
   - `OWNER_ID` (optional)
6. Deploy.

Persistent config:
- `config.json` contains admin mode/whitelist.
- In Coolify, add a persistent storage mount to `/app/config.json` if you want settings to survive full redeploys.

## How to Use
1. Start the bot in Telegram with `/start`.
2. Send an Instagram or TikTok link.
3. The bot will download the video and send it to you.

## Project Structure

- `bot.js`: Main entry point. Handles Telegram updates and logic.
- `services/`: Contains logic for fetching video URLs from different platforms.
  - `facebookInstaService.js`: Handles Instagram/Facebook.
  - `tiktokService.js`: Handles TikTok.

## License

ISC
