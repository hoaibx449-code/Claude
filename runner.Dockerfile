# Render machine image (Cloud Run Jobs or any container host).
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg espeak-ng ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY assets ./assets
USER node
ENV NODE_ENV=production
# /app belongs to root: caches go to a folder this user can write
ENV NV_VOICE_CACHE_DIR=/tmp/nv-voice
CMD ["node", "src/cli/runner.ts", "--drain"]
