# Usa la imagen oficial de Playwright (tiene Chromium + deps)
FROM mcr.microsoft.com/playwright:v1.42.1-jammy

WORKDIR /app

# Copiamos solo package.json primero (cache de npm)
COPY package*.json ./

# Le decimos a Puppeteer que no descargue Chromium
# y que use el binario del sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Instalamos dependencias
RUN npm install

# Copiamos el resto del código
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
