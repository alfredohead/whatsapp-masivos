# Usa la imagen de Playwright (incluye Chromium + libs)
FROM mcr.microsoft.com/playwright:v1.42.1-jammy

WORKDIR /app

# Ignoramos node_modules y .local-chromium al copiar
COPY package*.json ./
RUN npm install

# Copia el resto del código
COPY . .

# Expone el puerto (Render provee $PORT)
EXPOSE 3000

# Comando de arranque
CMD ["npm", "start"]
