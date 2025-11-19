FROM node:22.21-alpine

WORKDIR /app

# Instalamos dependencias del sistema básicas.
# Quitamos chromium y sus librerías gráficas.
# Agregamos tzdata por si necesitas configurar la hora correcta en los logs.
RUN apk add --no-cache \
    git \
    tzdata \
    shadow

# Copiamos dependencias primero para aprovechar el caché de Docker
COPY package*.json ./

# Instalamos dependencias de Node

# Copiamos el resto del código
COPY . .

# Argumentos para manejar permisos de usuario (Igual que tu referencia)
# Esto ayuda a que la carpeta de sesión en el host sea accesible.
ARG USER_ID=1001
ARG GROUP_ID=1001

# Usamos 'baileys_user' en lugar de 'pptruser'.
# Creamos el grupo y el usuario con los IDs especificados.
RUN addgroup -g $GROUP_ID baileys_user && \
    adduser -u $USER_ID -G baileys_user -h /home/baileys_user -D baileys_user && \
    mkdir -p /home/baileys_user && \
    chown -R baileys_user:baileys_user /home/baileys_user

RUN npm install

# IMPORTANTE: Define aquí el nombre de la carpeta donde Baileys guarda la sesión.
# En Baileys suele ser 'baileys_auth_info' o 'auth_info_baileys' si usas useMultiFileAuthState.
# Aquí asumo que se llama 'baileys_auth'. CAMBIALO si tu código usa otro nombre.
RUN mkdir -p /app/auth_info_baileys \
    && chown -R baileys_user:baileys_user /app

# Cambiamos al usuario sin privilegios
USER baileys_user

CMD ["npm", "start"]