# ---------- runtime stage ----------
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
    libxss1 libxshmfence1 libgbm1 libgtk-3-0 \
    libpango-1.0-0 libcairo2 libasound2 fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# App source
COPY index.js ./
# Deps + downloaded Chromium
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /root/.cache/puppeteer /root/.cache/puppeteer

ENV NODE_ENV=production
ENV PORT=3000        # comment moved to its own line ↑

EXPOSE 3000
CMD ["node", "index.js"]
