# Dockerfile para el backend de Aviator Game
FROM node:18-alpine

# Instalar dumb-init y bash (opcional si tus scripts lo requieren)
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json tsconfig.json ./

# Instalar TODAS las dependencias (incluyendo dev para compilar)
RUN npm install

# Copiar el resto del código
COPY . .

# 👇 Compilar TypeScript a JS
RUN npm run build

# Crear usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start:prod"]
