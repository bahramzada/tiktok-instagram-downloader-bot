FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV CONFIG_FILE_PATH=/app/config.json

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY bot.js config.json ./
COPY services ./services

RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app

USER app

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD pgrep -f "node bot.js" > /dev/null || exit 1

CMD ["node", "bot.js"]
