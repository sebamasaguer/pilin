# Usar una imagen base de Node.js
FROM node:18-alpine

# Crear el directorio de la aplicación
WORKDIR /usr/src/app

# Copiar los archivos de definición de dependencias
COPY package*.json ./

# Instalar las dependencias
RUN npm install

# Copiar el resto del código de la aplicación
COPY . .

# Exponer el puerto que usará la aplicación (si es necesario para acceso directo)
# EXPOSE 3000

# Comando para ejecutar la aplicación
CMD [ "node", "bot.js" ]
