const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
});

// Probar la conexión a la base de datos
const testConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Conexión a PostgreSQL exitosa:', res.rows[0].now);
    return true;
  } catch (err) {
    console.error('Error al conectar con PostgreSQL:', err);
    // process.exit(1); // Considerar si el bot debe detenerse si no hay BD
    return false;
  }
};

// Crear tablas iniciales si no existen
const initializeSchema = async () => {
  const createAdminTableQuery = `
    CREATE TABLE IF NOT EXISTS administradores (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username VARCHAR(255), -- Nombre de usuario de Telegram (puede cambiar, usar con cuidado)
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createClientTableQuery = `
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE,
      nombre VARCHAR(255) NOT NULL,
      apellido VARCHAR(255),
      telefono VARCHAR(50) UNIQUE,
      direccion TEXT NOT NULL,
      notas TEXT,
      creado_por_admin_id INTEGER, -- REFERENCES administradores(id) ON DELETE SET NULL (opcional)
      activo BOOLEAN DEFAULT TRUE,
      fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      --CONSTRAINT fk_admin_cliente FOREIGN KEY (creado_por_admin_id) REFERENCES administradores(id) ON DELETE SET NULL
      -- Se puede añadir el constraint después si la tabla administradores ya existe siempre.
    );
  `;

  const createFunctionUpdateTimestampQuery = `
    CREATE OR REPLACE FUNCTION update_fecha_actualizacion_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.fecha_actualizacion = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `;

  const applyTriggerToClientesQuery = `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_clientes_fecha_actualizacion' AND tgrelid = 'clientes'::regclass
      ) THEN
        CREATE TRIGGER update_clientes_fecha_actualizacion
        BEFORE UPDATE ON clientes
        FOR EACH ROW
        EXECUTE FUNCTION update_fecha_actualizacion_column();
      END IF;
    END $$;
  `;
   const applyTriggerToAdministradoresQuery = `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_administradores_fecha_actualizacion' AND tgrelid = 'administradores'::regclass
      ) THEN
        CREATE TRIGGER update_administradores_fecha_actualizacion
        BEFORE UPDATE ON administradores
        FOR EACH ROW
        EXECUTE FUNCTION update_fecha_actualizacion_column();
      END IF;
    END $$;
  `;


  // TODO: Crear tabla de productos (si se gestionan dinámicamente)
  // TODO: Crear tabla de pedidos

  try {
    await pool.query(createAdminTableQuery);
    console.log('Tabla "administradores" verificada/creada.');
    await pool.query(createClientTableQuery);
    console.log('Tabla "clientes" verificada/creada.');

    await pool.query(createFunctionUpdateTimestampQuery);
    console.log('Función de trigger "update_fecha_actualizacion_column" verificada/creada.');
    await pool.query(applyTriggerToClientesQuery);
    console.log('Trigger "update_clientes_fecha_actualizacion" aplicado a tabla "clientes".');
    await pool.query(applyTriggerToAdministradoresQuery);
    console.log('Trigger "update_administradores_fecha_actualizacion" aplicado a tabla "administradores".');

    // Añadir FK constraint si no existe, esto es más seguro hacerlo después de crear ambas tablas
    const addFkClientAdminConstraintQuery = `
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_cliente_creado_por_admin' AND conrelid = 'clientes'::regclass
        ) THEN
            ALTER TABLE clientes
            ADD CONSTRAINT fk_cliente_creado_por_admin
            FOREIGN KEY (creado_por_admin_id)
            REFERENCES administradores(id) ON DELETE SET NULL;
            RAISE NOTICE 'Constraint fk_cliente_creado_por_admin añadido a la tabla clientes.';
        END IF;
    END;
    $$;
    `;
    await pool.query(addFkClientAdminConstraintQuery);

    // --- Tablas de Pedidos ---
    const createPedidosTableQuery = `
      CREATE TABLE IF NOT EXISTS pedidos (
          id SERIAL PRIMARY KEY,
          cliente_id INTEGER NOT NULL,
          admin_id INTEGER,
          fecha_pedido TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          fecha_entrega_estimada TIMESTAMP WITH TIME ZONE,
          fecha_entrega_real TIMESTAMP WITH TIME ZONE,
          direccion_entrega TEXT NOT NULL,
          estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
          notas_pedido TEXT,
          total_pedido DECIMAL(10, 2) DEFAULT 0.00,
          metodo_pago VARCHAR(50),
          fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
          CONSTRAINT fk_pedido_admin FOREIGN KEY (admin_id) REFERENCES administradores(id) ON DELETE SET NULL
      );
    `;
    const createPedidosItemsTableQuery = `
      CREATE TABLE IF NOT EXISTS pedidos_items (
          id SERIAL PRIMARY KEY,
          pedido_id INTEGER NOT NULL,
          nombre_producto VARCHAR(255) NOT NULL,
          cantidad INTEGER NOT NULL CHECK (cantidad > 0),
          precio_unitario DECIMAL(10, 2) NOT NULL,
          subtotal DECIMAL(10, 2) NOT NULL,
          CONSTRAINT fk_item_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
      );
    `;

    await pool.query(createPedidosTableQuery);
    console.log('Tabla "pedidos" verificada/creada.');
    await pool.query(createPedidosItemsTableQuery);
    console.log('Tabla "pedidos_items" verificada/creada.');

    const applyTriggerToPedidosQuery = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgname = 'update_pedidos_fecha_actualizacion' AND tgrelid = 'pedidos'::regclass
        ) THEN
          CREATE TRIGGER update_pedidos_fecha_actualizacion
          BEFORE UPDATE ON pedidos
          FOR EACH ROW
          EXECUTE FUNCTION update_fecha_actualizacion_column();
        END IF;
      END $$;
    `;
    await pool.query(applyTriggerToPedidosQuery);
    console.log('Trigger "update_pedidos_fecha_actualizacion" aplicado a tabla "pedidos".');

  } catch (err) {
    console.error('Error al inicializar el esquema de la base de datos:', err);
    throw err; // Re-lanzar el error para que el bot principal lo maneje si es necesario
  }
};

// Funciones para Administradores
const addAdmin = async (telegramId, username, firstName, lastName) => {
  const query = `
    INSERT INTO administradores (telegram_id, username, first_name, last_name, is_active)
    VALUES ($1, $2, $3, $4, TRUE)
    ON CONFLICT (telegram_id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      is_active = TRUE,
      fecha_actualizacion = CURRENT_TIMESTAMP
    RETURNING *;
  `;
  // ON CONFLICT actualiza los datos y lo reactiva si ya existía.
  // Si solo se quiere añadir si no existe y no hacer nada si existe, usar ON CONFLICT (telegram_id) DO NOTHING.
  try {
    const res = await pool.query(query, [telegramId, username, firstName, lastName]);
    return res.rows[0];
  } catch (err) {
    console.error('Error al agregar/actualizar administrador:', err);
    throw err;
  }
};

const findAdminByTelegramId = async (telegramId) => {
  const query = 'SELECT * FROM administradores WHERE telegram_id = $1;'; // No filtramos por is_active aquí, lo hacemos en la lógica del bot
  try {
    const res = await pool.query(query, [telegramId]);
    return res.rows[0]; // Retorna el admin si se encuentra, o undefined
  } catch (err) {
    console.error('Error al buscar administrador:', err);
    throw err;
  }
};

const getAllAdmins = async () => {
  const query = 'SELECT telegram_id, username, first_name, last_name, is_active FROM administradores ORDER BY created_at DESC;';
  try {
    const res = await pool.query(query);
    return res.rows;
  } catch (err) {
    console.error('Error al obtener todos los administradores:', err);
    throw err;
  }
};

const setAdminStatus = async (telegramIdToUpdate, isActive) => {
  // El trigger update_administradores_fecha_actualizacion se encargará de la columna fecha_actualizacion
  const query = 'UPDATE administradores SET is_active = $1 WHERE telegram_id = $2 RETURNING *;';
  try {
    const res = await pool.query(query, [isActive, telegramIdToUpdate]);
    return res.rows[0];
  } catch (err) {
    console.error('Error al actualizar estado del administrador:', err);
    throw err;
  }
};


module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  testConnection,
  initializeSchema,
  addAdmin,
  findAdminByTelegramId,
  getAllAdmins,
  setAdminStatus,
  // Clientes
  addClient,
  findClientById,
  findClientByPhone,
  findClientByTelegramId,
  getAllClients,
  updateClient,
  setClientStatus,
  // Pedidos
  createOrder,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  updateOrderDetails,
};

// Funciones para Pedidos

// ESTADOS DE PEDIDO POSIBLES (para referencia y uso en bot.js)
// const ESTADOS_PEDIDO = ['pendiente', 'confirmado', 'preparacion', 'en_camino', 'entregado', 'cancelado', 'problema'];

const createOrder = async (orderData, items, adminTelegramId) => {
  const { cliente_id, direccion_entrega, notas_pedido, metodo_pago, fecha_entrega_estimada } = orderData;
  let adminDbId = null;
  if (adminTelegramId) {
    const admin = await findAdminByTelegramId(adminTelegramId); // Asume que esta función ya está exportada y disponible
    if (admin) adminDbId = admin.id;
  }

  let totalPedidoCalculado = 0;
  for (const item of items) {
    totalPedidoCalculado += parseFloat(item.precio_unitario) * parseInt(item.cantidad);
  }

  const client = await pool.connect(); // Usar una conexión de cliente para la transacción
  try {
    await client.query('BEGIN');

    const pedidoQuery = `
      INSERT INTO pedidos (cliente_id, admin_id, direccion_entrega, notas_pedido, metodo_pago, fecha_entrega_estimada, estado, total_pedido)
      VALUES ($1, $2, $3, $4, $5, $6, 'pendiente', $7)
      RETURNING *;
    `;
    const pedidoRes = await client.query(pedidoQuery, [
      cliente_id, adminDbId, direccion_entrega, notas_pedido, metodo_pago, fecha_entrega_estimada, totalPedidoCalculado.toFixed(2)
    ]);
    const nuevoPedido = pedidoRes.rows[0];

    for (const item of items) {
      const itemQuery = `
        INSERT INTO pedidos_items (pedido_id, nombre_producto, cantidad, precio_unitario, subtotal)
        VALUES ($1, $2, $3, $4, $5);
      `;
      const subtotal = parseFloat(item.precio_unitario) * parseInt(item.cantidad);
      await client.query(itemQuery, [nuevoPedido.id, item.nombre_producto, item.cantidad, item.precio_unitario, subtotal.toFixed(2)]);
    }

    await client.query('COMMIT');
    // Devolver el pedido con sus items (haciendo una nueva consulta para obtenerlos)
    return getOrderById(nuevoPedido.id);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear pedido (transacción revertida):', err);
    throw err;
  } finally {
    client.release();
  }
};

const getOrderById = async (pedidoId) => {
  const pedidoQuery = `
    SELECT p.*,
           c.nombre AS cliente_nombre, c.apellido AS cliente_apellido, c.telefono AS cliente_telefono,
           a.username AS admin_username, a.first_name AS admin_first_name
    FROM pedidos p
    JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN administradores a ON p.admin_id = a.id
    WHERE p.id = $1;
  `;
  const itemsQuery = 'SELECT * FROM pedidos_items WHERE pedido_id = $1 ORDER BY id ASC;';

  try {
    const pedidoRes = await pool.query(pedidoQuery, [pedidoId]);
    if (pedidoRes.rows.length === 0) return null;

    const pedido = pedidoRes.rows[0];
    const itemsRes = await pool.query(itemsQuery, [pedidoId]);
    pedido.items = itemsRes.rows;

    return pedido;
  } catch (err) {
    console.error(`Error al obtener pedido por ID ${pedidoId}:`, err);
    throw err;
  }
};

const getAllOrders = async (filters = {}, page = 1, limit = 10) => {
  const { cliente_id, estado, fecha_desde, fecha_hasta, admin_id, sort_by = 'fecha_pedido', sort_order = 'DESC' } = filters;
  let query = `
    SELECT p.id, p.fecha_pedido, p.estado, p.total_pedido,
           c.nombre AS cliente_nombre, c.apellido AS cliente_apellido, c.id AS cliente_db_id
    FROM pedidos p
    JOIN clientes c ON p.cliente_id = c.id
  `;
  const whereClauses = [];
  const params = [];
  let paramIndex = 1;

  if (cliente_id) {
    whereClauses.push(`p.cliente_id = $${paramIndex++}`);
    params.push(cliente_id);
  }
  if (estado) {
    whereClauses.push(`p.estado ILIKE $${paramIndex++}`); // Usar ILIKE para que no sea case-sensitive
    params.push(estado);
  }
  if (admin_id) {
    whereClauses.push(`p.admin_id = $${paramIndex++}`);
    params.push(admin_id);
  }
  if (fecha_desde) {
    whereClauses.push(`p.fecha_pedido >= $${paramIndex++}`);
    params.push(fecha_desde);
  }
  if (fecha_hasta) {
    // Para incluir todo el día de fecha_hasta, ajustar a final del día
    const dateHasta = new Date(fecha_hasta);
    dateHasta.setHours(23, 59, 59, 999);
    whereClauses.push(`p.fecha_pedido <= $${paramIndex++}`);
    params.push(dateHasta);
  }

  if (whereClauses.length > 0) {
    query += ' WHERE ' + whereClauses.join(' AND ');
  }

  const validSortColumns = ['fecha_pedido', 'estado', 'total_pedido', 'id'];
  const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'fecha_pedido';
  const orderDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  query += ` ORDER BY p.${sortColumn} ${orderDirection}, p.id ${orderDirection}`;

  const offset = (page - 1) * limit;
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++};`;
  params.push(limit, offset);

  // Count query
  let countQuery = `SELECT COUNT(*) FROM pedidos p`;
  let countParams = params.slice(0, whereClauses.length); // Solo los params de WHERE

  if (whereClauses.length > 0) {
    countQuery += ' WHERE ' + whereClauses.join(' AND ');
  }

  try {
    const ordersRes = await pool.query(query, params);
    const countRes = await pool.query(countQuery, countParams);
    return { orders: ordersRes.rows, total: parseInt(countRes.rows[0].count, 10), page, limit };
  } catch (err) {
    console.error('Error al obtener todos los pedidos:', err);
    throw err;
  }
};


const updateOrderStatus = async (pedidoId, nuevoEstado, adminTelegramId = null) => {
  let adminDbId = null;
  if (adminTelegramId) {
    const admin = await findAdminByTelegramId(adminTelegramId);
    if (admin) adminDbId = admin.id;
  }

  let setClauses = ['estado = $1', 'fecha_actualizacion = CURRENT_TIMESTAMP'];
  const queryParams = [nuevoEstado, pedidoId];
  let paramCounter = 3;

  if (nuevoEstado.toLowerCase() === 'entregado') {
    setClauses.push('fecha_entrega_real = CURRENT_TIMESTAMP');
  }
  if (adminDbId) {
    // Actualizar admin_id solo si se proporciona y es diferente del actual (o si el actual es null)
    // Opcional: podrías añadir lógica para no sobrescribir si ya hay un admin_id,
    // o siempre actualizar al último que modificó el estado.
    // Aquí, simplemente lo actualizamos si se proporciona.
    setClauses.push(`admin_id = $${paramCounter++}`);
    queryParams.push(adminDbId);
  }

  const query = `
    UPDATE pedidos
    SET ${setClauses.join(', ')}
    WHERE id = $2
    RETURNING *;
  `;
  // El $2 siempre es pedidoId. Los otros params se añaden al final de queryParams.

  try {
    const res = await pool.query(query, queryParams);
    if (res.rows.length === 0) throw new Error(`Pedido con ID ${pedidoId} no encontrado.`);
    return getOrderById(res.rows[0].id); // Devolver con items
  } catch (err) {
    console.error(`Error al actualizar estado del pedido ${pedidoId}:`, err);
    throw err;
  }
};

const updateOrderDetails = async (pedidoId, updates) => {
  const allowedFields = ['fecha_entrega_estimada', 'direccion_entrega', 'notas_pedido', 'metodo_pago'];
  const fieldsToUpdate = [];
  const values = [];
  let paramIndex = 1;

  for (const field of allowedFields) {
    if (updates[field] !== undefined) { // Permite null para limpiar campos como fecha_entrega_estimada
      fieldsToUpdate.push(`${field} = $${paramIndex++}`);
      values.push(updates[field]);
    }
  }

  if (fieldsToUpdate.length === 0) {
    return getOrderById(pedidoId);
  }

  values.push(pedidoId);
  const query = `
    UPDATE pedidos
    SET ${fieldsToUpdate.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = $${paramIndex}
    RETURNING *;
  `;

  try {
    const res = await pool.query(query, values);
    if (res.rows.length === 0) throw new Error(`Pedido con ID ${pedidoId} no encontrado.`);
    return getOrderById(res.rows[0].id);
  } catch (err) {
    console.error(`Error al actualizar detalles del pedido ${pedidoId}:`, err);
    throw err;
  }
};

// Funciones para Clientes

const addClient = async (clientData, adminTelegramId) => {
  const { nombre, apellido, telefono, direccion, notas, telegram_id: clientTelegramId } = clientData;
  // Obtener el id interno del administrador
  let adminDbId = null;
  if (adminTelegramId) {
    const admin = await findAdminByTelegramId(adminTelegramId); // Esta función ya está definida arriba
    if (admin) {
      adminDbId = admin.id;
    }
  }

  const query = `
    INSERT INTO clientes (nombre, apellido, telefono, direccion, notas, telegram_id, creado_por_admin_id, activo)
    VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
    ON CONFLICT (telefono) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        apellido = EXCLUDED.apellido,
        direccion = EXCLUDED.direccion,
        notas = EXCLUDED.notas,
        telegram_id = EXCLUDED.telegram_id,
        activo = TRUE, -- Reactivar si estaba inactivo y se intenta añadir de nuevo
        fecha_actualizacion = CURRENT_TIMESTAMP
    RETURNING *;
  `;
  try {
    const res = await pool.query(query, [nombre, apellido, telefono, direccion, notas, clientTelegramId, adminDbId]);
    return res.rows[0];
  } catch (err) {
    console.error('Error al agregar/actualizar cliente:', err);
    if (err.constraint === 'clientes_telefono_key' && telefono) { // Añadir chequeo de telefono no nulo
        throw new Error(`El teléfono '${telefono}' ya está registrado para otro cliente.`);
    }
    if (err.constraint === 'clientes_telegram_id_key' && clientTelegramId) {
        throw new Error(`El Telegram ID '${clientTelegramId}' ya está registrado para otro cliente.`);
    }
    throw err;
  }
};

const findClientById = async (id) => {
  const query = 'SELECT c.*, a.username as admin_username FROM clientes c LEFT JOIN administradores a ON c.creado_por_admin_id = a.id WHERE c.id = $1;';
  try {
    const res = await pool.query(query, [id]);
    return res.rows[0];
  } catch (err) {
    console.error('Error al buscar cliente por ID:', err);
    throw err;
  }
};

const findClientByPhone = async (telefono) => {
  if (!telefono) return null; // No buscar si el teléfono es nulo o vacío
  const query = 'SELECT c.*, a.username as admin_username FROM clientes c LEFT JOIN administradores a ON c.creado_por_admin_id = a.id WHERE c.telefono = $1;';
  try {
    const res = await pool.query(query, [telefono]);
    return res.rows[0];
  } catch (err) {
    console.error('Error al buscar cliente por teléfono:', err);
    throw err;
  }
};

const findClientByTelegramId = async (telegramId) => {
  if (!telegramId) return null;
  const query = 'SELECT c.*, a.username as admin_username FROM clientes c LEFT JOIN administradores a ON c.creado_por_admin_id = a.id WHERE c.telegram_id = $1;';
  try {
    const res = await pool.query(query, [telegramId]);
    return res.rows[0];
  } catch (err) {
    console.error('Error al buscar cliente por Telegram ID:', err);
    throw err;
  }
};

const getAllClients = async (page = 1, limit = 10, activeOnly = null, searchTerm = null) => {
  let query = 'SELECT c.id, c.nombre, c.apellido, c.telefono, c.direccion, c.activo, c.telegram_id FROM clientes c';
  const params = [];
  let whereClauses = [];
  let paramIndex = 1;

  if (activeOnly !== null) {
    whereClauses.push(`c.activo = $${paramIndex++}`);
    params.push(activeOnly);
  }

  if (searchTerm) {
    whereClauses.push(`(c.nombre ILIKE $${paramIndex} OR c.apellido ILIKE $${paramIndex} OR c.telefono ILIKE $${paramIndex} OR c.direccion ILIKE $${paramIndex})`);
    params.push(`%${searchTerm}%`);
    paramIndex++;
  }

  if (whereClauses.length > 0) {
    query += ' WHERE ' + whereClauses.join(' AND ');
  }

  query += ` ORDER BY c.nombre ASC, c.apellido ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++};`;
  params.push(limit, (page - 1) * limit);

  try {
    const res = await pool.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM clientes c';
    const countParams = [];
    let countParamIndex = 1;
    let countWhereClauses = [];

    if (activeOnly !== null) {
        countWhereClauses.push(`c.activo = $${countParamIndex++}`);
        countParams.push(activeOnly);
    }
    if (searchTerm) {
        countWhereClauses.push(`(c.nombre ILIKE $${countParamIndex} OR c.apellido ILIKE $${countParamIndex} OR c.telefono ILIKE $${countParamIndex} OR c.direccion ILIKE $${countParamIndex})`);
        countParams.push(`%${searchTerm}%`);
    }
    if (countWhereClauses.length > 0) {
        countQuery += ' WHERE ' + countWhereClauses.join(' AND ');
    }

    const countRes = await pool.query(countQuery, countParams);
    return { clients: res.rows, total: parseInt(countRes.rows[0].count, 10), page, limit };

  } catch (err) {
    console.error('Error al obtener todos los clientes:', err);
    throw err;
  }
};

const updateClient = async (id, updates) => {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  // Campos permitidos para actualización
  const allowedFields = ['nombre', 'apellido', 'telefono', 'direccion', 'notas', 'telegram_id', 'activo'];

  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key) && updates[key] !== undefined) {
      fields.push(`${key} = $${paramIndex++}`);
      values.push(updates[key]);
    }
  });

  if (fields.length === 0) {
    console.log("No hay campos válidos para actualizar para el cliente ID:", id);
    return findClientById(id); // No hay nada que actualizar
  }

  values.push(id); // Para la cláusula WHERE id = $X
  const query = `
    UPDATE clientes
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *;
  `; // fecha_actualizacion se actualiza por trigger

  try {
    const res = await pool.query(query, values);
    if (res.rows.length === 0) {
        throw new Error(`Cliente con ID ${id} no encontrado para actualizar.`);
    }
    return res.rows[0];
  } catch (err) {
    console.error('Error al actualizar cliente:', err);
    if (err.constraint === 'clientes_telefono_key' && updates.telefono) {
        throw new Error(`El teléfono '${updates.telefono}' ya está registrado para otro cliente.`);
    }
    if (err.constraint === 'clientes_telegram_id_key' && updates.telegram_id) {
        throw new Error(`El Telegram ID '${updates.telegram_id}' ya está registrado para otro cliente.`);
    }
    throw err;
  }
};

const setClientStatus = async (id, activo) => {
  // Esta función es un caso particular de updateClient, pero la mantenemos por claridad si se usa directamente.
  // O se puede refactorizar para que use updateClient.
  const query = 'UPDATE clientes SET activo = $1 WHERE id = $2 RETURNING *;'; // fecha_actualizacion se actualiza por trigger
  try {
    const res = await pool.query(query, [activo, id]);
    if (res.rows.length === 0) {
        throw new Error(`Cliente con ID ${id} no encontrado para actualizar estado.`);
    }
    return res.rows[0];
  } catch (err) {
    console.error('Error al actualizar estado del cliente:', err);
    throw err;
  }
};
