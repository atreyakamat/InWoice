FROM ghcr.io/puppeteer/puppeteer:24.38.0

WORKDIR /usr/src/app

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p data/openwa-sessions uploads backups logs

EXPOSE 5000

CMD ["npm", "start"]
