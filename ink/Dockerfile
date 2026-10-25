# Ink Studio render machine as a container: Google Cloud Run Jobs, or any Docker host.
#   Cloud Run job (started by the site, takes every queued video, stops):  python -m ink.site
#   Always-on Docker server:  docker run -d --restart always -e NV_API_URL=... -e RUNNER_TOKEN=ink_... IMAGE python -m ink.site --loop
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ink ./ink
COPY assets ./assets
RUN useradd --create-home ink
USER ink
ENV INK_CACHE=/tmp/ink-voice HF_HOME=/tmp/hf PYTHONUNBUFFERED=1
CMD ["python", "-m", "ink.site"]
