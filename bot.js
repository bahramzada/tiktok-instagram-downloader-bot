const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const facebookInsta = require('./services/facebookInstaService');
const { fetchTikTokData } = require('./services/tiktokService');

// Configuration
const configFile = process.env.CONFIG_FILE_PATH || path.join(__dirname, 'config.json');
const OWNER_ID = Number.parseInt(process.env.OWNER_ID || '861207023', 10);

// Default Config
let config = {
    mode: 'public', // 'public' or 'private'
    whitelist: []
};

// Load Config
function loadConfig() {
    if (fs.existsSync(configFile)) {
        try {
            const data = fs.readFileSync(configFile, 'utf8');
            const loaded = JSON.parse(data);
            config = { ...config, ...loaded }; // Merge with default to ensure fields exist
        } catch (err) {
            console.error('Error loading config:', err);
        }
    } else {
        saveConfig();
    }
}

// Save Config
function saveConfig() {
    try {
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Error saving config:', err);
    }
}

loadConfig();

// Retrieve token from environment variable
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required. Set it as an environment variable.');
}

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

console.log('Bot is starting...');

function isTransientNetworkError(error) {
    const code = error && (error.code || (error.cause && error.cause.code));
    return ['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'].includes(code);
}

async function withRetry(task, retries = 2, delayMs = 1500) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await task();
        } catch (error) {
            lastError = error;
            if (attempt === retries || !isTransientNetworkError(error)) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        }
    }
    throw lastError;
}

// Matches Instagram links
const instaRegex = /(https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([^\/?#&]+)).*/;
// Matches TikTok links (including short links)
const tiktokRegex = /(https?:\/\/(?:www\.|vt\.)?tiktok\.com\/.*)/;

// Admin Command Handler
bot.onText(/\/admin(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId !== OWNER_ID) {
        return; // Ignore unauthorized admin attempts
    }

    const args = match[1] ? match[1].split(/\s+/) : [];
    const command = args[0] ? args[0].toLowerCase() : 'info';

    let response = '';

    switch (command) {
        case 'info':
            response = `Current Mode: *${config.mode}*\nWhitelist: ${config.whitelist.length} users\n\nCommands:\n/admin public\n/admin private\n/admin add <id>\n/admin remove <id>\n/admin list`;
            break;
        case 'public':
            config.mode = 'public';
            saveConfig();
            response = 'Bot is now in *Public* mode. Everyone can use it.';
            break;
        case 'private':
            config.mode = 'private';
            saveConfig();
            response = 'Bot is now in *Private* mode. Only owner and whitelist can use it.';
            break;
        case 'add':
            if (args[1]) {
                const idToAdd = parseInt(args[1]);
                if (!isNaN(idToAdd)) {
                    if (!config.whitelist.includes(idToAdd)) {
                        config.whitelist.push(idToAdd);
                        saveConfig();
                        response = `User \`${idToAdd}\` added to whitelist.`;
                    } else {
                        response = `User \`${idToAdd}\` is already in the whitelist.`;
                    }
                } else {
                    response = 'Invalid ID.';
                }
            } else {
                response = 'Usage: /admin add <id>';
            }
            break;
        case 'remove':
            if (args[1]) {
                const idToRemove = parseInt(args[1]);
                const index = config.whitelist.indexOf(idToRemove);
                if (index > -1) {
                    config.whitelist.splice(index, 1);
                    saveConfig();
                    response = `User \`${idToRemove}\` removed from whitelist.`;
                } else {
                    response = `User ID not found in whitelist.`;
                }
            } else {
                response = 'Usage: /admin remove <id>';
            }
            break;
        case 'list':
            if (config.whitelist.length === 0) {
                response = 'Whitelist is empty.';
            } else {
                response = `Whitelist:\n\`${config.whitelist.join('\n')}\``;
            }
            break;
        default:
            response = 'Unknown command. Use /admin info';
    }

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (!text) return;
    
    // Ignore commands starting with /admin to avoid double processing (handled by onText)
    if (text.startsWith('/admin')) return;

    // Access Control Logic
    if (config.mode === 'private') {
        const isOwner = userId === OWNER_ID;
        const isWhitelisted = config.whitelist.includes(userId);

        if (!isOwner && !isWhitelisted) {
            // Only reply if they are trying to use the bot commands or send links
            if (text.startsWith('/start') || instaRegex.test(text) || tiktokRegex.test(text)) {
                 bot.sendMessage(chatId, '⛔ This bot is currently in Private mode. Access is restricted to authorized users only.');
            }
            return;
        }
    }

    if (text === '/start') {
        bot.sendMessage(chatId, 'Welcome! Send me an Instagram or TikTok link to download the video.');
        return;
    }

    let downloadPromise;
    let platform;

    if (instaRegex.test(text)) {
        platform = 'Instagram';
        downloadPromise = handleInstagram(text);
    } else if (tiktokRegex.test(text)) {
        platform = 'TikTok';
        downloadPromise = handleTikTok(text);
    } else {
        return; // Ignore non-link messages
    }

    bot.sendMessage(chatId, `Processing ${platform} link...`);

    let tempFilePath;
    try {
        const videoData = await downloadPromise;
        if (!videoData || !videoData.url) {
            throw new Error('Could not find video URL.');
        }

        console.log(`Downloading video for ${chatId}...`);
        tempFilePath = path.join(__dirname, `video_${chatId}_${Date.now()}.mp4`);
        const writer = fs.createWriteStream(tempFilePath);

        const response = await withRetry(() => axios({
            method: 'GET',
            url: videoData.url,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        }));

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log(`Sending video to ${chatId}...`);
        await bot.sendVideo(chatId, tempFilePath, {
            caption: videoData.title || `Here is your ${platform} video!`,
        });

    } catch (error) {
        console.error('Error:', error.message);
        bot.sendMessage(chatId, `Sorry, I could not download the video. Error: ${error.message}`);
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            console.log(`Deleted temp file: ${tempFilePath}`);
        }
    }
});

async function handleInstagram(url) {
    const result = await facebookInsta(url);
    if (result && result.data && result.data.length > 0) {
        // Find the best quality or first video
        const video = result.data.find(item => item.url); 
        return {
            url: video.url,
            title: 'Instagram Video' 
        };
    }
    throw new Error('No video found.');
}

async function handleTikTok(url) {
    const result = await fetchTikTokData(url);
    if (result && result.downloads && result.downloads.length > 0) {
        // Prioritize "Without watermark"
        const noWatermark = result.downloads.find(d => d.text && d.text.includes('Without watermark'));
        const videoUrl = noWatermark ? noWatermark.url : result.downloads[0].url;
        
        return {
            url: videoUrl,
            title: result.title || 'TikTok Video'
        };
    }
    throw new Error('No video found.');
}

bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code || error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});
