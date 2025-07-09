# Bot de Telegram para Gestión de Reparto de Agua y Hielo

Este es un bot de Telegram desarrollado en Node.js con una base de datos PostgreSQL, diseñado para facilitar la gestión de clientes, pedidos y el reparto de agua en bidones y hielo. El sistema está contenedorizado usando Docker.

## Características Principales

*   Gestión de Administradores (con un Super Administrador inicial).
*   Gestión de Clientes (CRUD completo).
*   Gestión de Pedidos (creación, visualización, actualización de estado, edición de detalles).
*   Interacción mediante comandos de Telegram.
*   Persistencia de datos en PostgreSQL.
*   Entorno de ejecución con Docker y Docker Compose.

## Requisitos Previos

*   [Docker](https://www.docker.com/get-started)
*   [Docker Compose](https://docs.docker.com/compose/install/) (generalmente viene con Docker Desktop)
*   Un Token de Bot de Telegram (obtenido de [BotFather](https://t.me/botfather)).
*   Un Telegram ID para el Super Administrador (puedes obtener tu ID hablando con bots como `@userinfobot`).

## Configuración

1.  **Clonar el Repositorio (si aplica):**
    ```bash
    git clone <URL_DEL_REPOSITORIO>
    cd <NOMBRE_DEL_DIRECTORIO>
    ```

2.  **Crear el archivo de Entorno:**
    Copia el archivo `.env.example` a `.env`:
    ```bash
    cp .env.example .env
    ```
    Edita el archivo `.env` con tus propios valores:
    ```
    # Telegram Bot Token
    TELEGRAM_BOT_TOKEN=TU_TOKEN_DE_TELEGRAM_BOT

    # PostgreSQL Credentials
    POSTGRES_USER=admin_bot # Puedes dejar estos o cambiarlos
    POSTGRES_PASSWORD=supersecretpassword_bot # Cambia esta contraseña
    POSTGRES_DB=water_ice_bot_db
    POSTGRES_HOST=db
    POSTGRES_PORT=5432

    # Node environment (development o production)
    NODE_ENV=development

    # Super Admin Telegram ID
    SUPER_ADMIN_TELEGRAM_ID=TU_ID_DE_TELEGRAM_NUMERICO
    ```
    *   `TELEGRAM_BOT_TOKEN`: El token que te dio BotFather.
    *   `POSTGRES_...`: Credenciales para la base de datos. `POSTGRES_HOST` debe ser `db` (el nombre del servicio en `docker-compose.yml`).
    *   `SUPER_ADMIN_TELEGRAM_ID`: Tu ID numérico de Telegram. Este usuario tendrá permisos iniciales para configurar otros administradores.

## Ejecución del Bot

1.  **Construir y Ejecutar los Contenedores Docker:**
    Desde la raíz del proyecto, ejecuta:
    ```bash
    docker-compose up --build
    ```
    Para ejecutar en segundo plano (detached mode):
    ```bash
    docker-compose up --build -d
    ```

2.  **Verificar Logs:**
    Si ejecutas en segundo plano, puedes ver los logs del bot con:
    ```bash
    docker-compose logs -f app
    ```
    Y los logs de la base de datos con:
    ```bash
    docker-compose logs -f db
    ```

3.  **Interactuar con el Bot:**
    Abre Telegram y busca tu bot. Envía el comando `/start` o `/help` para ver la lista de comandos disponibles.

## Comandos Disponibles (para Administradores)

El bot responde a los siguientes comandos principales (accesibles por administradores registrados y activos):

*   **/start, /help**: Muestra el mensaje de ayuda con la lista de comandos.

**Administración de Usuarios:**
*   `/addadmin <ID_TELEGRAM> <NOMBRE> <APELLIDO>`: Añade un nuevo administrador (Solo Super Admin).
*   `/listadmins`: Lista todos los administradores.
*   `/setadminstatus <ID_TELEGRAM> <active|inactive>`: Cambia el estado de un administrador (Solo Super Admin).

**Gestión de Clientes:**
*   `/addclient <nombre> <apellido> <teléfono> <dirección> | [notas] | [id_telegram]`: Añade o actualiza un cliente.
*   `/listclients [página] [activos|inactivos|todos] [búsqueda]`: Lista clientes con paginación y filtros.
*   `/viewclient <ID_CLIENTE | TELÉFONO>`: Muestra detalles de un cliente.
*   `/editclient <ID_CLIENTE | TELÉFONO> <campo> <nuevo_valor>`: Edita un campo específico del cliente.
    *   Campos: `nombre`, `apellido`, `telefono`, `direccion`, `notas`, `telegram_id`, `activo` (usar `true`/`false`).
*   `/setclientstatus <ID_CLIENTE | TELÉFONO> <active|inactive>`: Activa o desactiva un cliente.

**Gestión de Pedidos:**
*   `/neworder <cliente> <item>:<cant> [item2:cant...] | [notas] | [dirección_alt] | [YYYY-MM-DD fecha_entrega] | [metodo_pago]`
    *   `<cliente>`: ID de cliente o número de teléfono.
    *   `<item>:<cant>`: Alias del producto y cantidad (ej: `agua20l:2 hielo5kg:1`). Alias disponibles: `agua20l`, `agua`, `bidon`, `20l`, `hielo5kg`, `hielo`, `bolsa`, `5kg`.
*   `/listorders [cliente] [estado] [página] [YYYY-MM-DD desde] [YYYY-MM-DD hasta]`: Lista pedidos con filtros.
*   `/vieworder <ID_PEDIDO>`: Muestra detalles de un pedido.
*   `/setorderstatus <ID_PEDIDO> <estado>`: Cambia el estado de un pedido.
    *   Estados: `pendiente`, `confirmado`, `preparacion`, `en_camino`, `entregado`, `cancelado`, `problema`.
*   `/editorder <ID_PEDIDO> <campo> <valor>`: Edita detalles de un pedido.
    *   Campos: `notas_pedido`, `direccion_entrega`, `fecha_entrega_estimada` (YYYY-MM-DD o `null`), `metodo_pago`.


## Estructura del Proyecto (Simplificada)

```
.
├── db/
│   └── database.js         # Lógica de conexión y consultas a PostgreSQL
├── .env.example            # Ejemplo de variables de entorno
├── .gitignore              # Archivos ignorados por Git
├── bot.js                  # Lógica principal del bot de Telegram
├── docker-compose.yml      # Definición de servicios Docker (app, db)
├── Dockerfile              # Instrucciones para construir la imagen Docker de la app
├── package.json            # Dependencias y scripts de Node.js
└── README.md               # Esta documentación
```

## Posibles Mejoras Futuras

*   Implementar interacción directa para clientes (hacer pedidos, ver historial).
*   Gestión de inventario de productos.
*   Notificaciones automáticas (ej. recordatorios de entrega, confirmación de pedido al cliente).
*   Roles más granulares para usuarios (repartidor, supervisor).
*   Panel de administración web.
*   Pruebas automatizadas más exhaustivas.
*   Mejoras en la paginación de `/listorders` (con botones de callback).

---
Desarrollado por Jules (IA Asistente de Codificación).
```
