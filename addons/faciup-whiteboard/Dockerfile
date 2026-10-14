FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg espeak-ng ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY assets ./assets
COPY addons/faciup-whiteboard ./addons/faciup-whiteboard
USER node
ENV NODE_ENV=production NV_VOICE_CACHE_DIR=/tmp/faciup-whiteboard-voice
CMD ["node", "addons/faciup-whiteboard/runner.ts", "--drain"]
