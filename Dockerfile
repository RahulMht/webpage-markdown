# Use full Node.js Debian image (NOT slim)
FROM node:20

# Set working directory
WORKDIR /app

# Install Puppeteer dependencies
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm1 \
    libgtk-3-0 \
    libxshmfence-dev \
 && rm -rf /var/lib/apt/lists/*

# Copy and install app
COPY package.json ./
RUN npm install

COPY index.js ./

# Expose port
EXPOSE 3000

# Run app
CMD ["node", "index.js"]
