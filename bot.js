// Cargar variables de entorno
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const db = require('./db/database'); // Importar el módulo de base de datos

// --- Definiciones del Negocio ---
const PRODUCTOS_DISPONIBLES = [
  { id: 'agua20l', nombre: 'Agua Bidón 20L', precio: 5.00, alias: ['agua', 'bidon', 'agua20', '20l'] },
  { id: 'hielo5kg', nombre: 'Hielo Bolsa 5kg', precio: 2.50, alias: ['hielo', 'bolsa', 'hielo5', '5kg'] },
];

const ESTADOS_PEDIDO = {
  PENDIENTE: 'pendiente',
  CONFIRMADO: 'confirmado',
  PREPARACION: 'preparacion',
  EN_CAMINO: 'en_camino',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado',
  PROBLEMA: 'problema'
};
const ESTADOS_PEDIDO_ARRAY = Object.values(ESTADOS_PEDIDO);
const ESTADOS_PEDIDO_STRING = ESTADOS_PEDIDO_ARRAY.join(', ');

// --- Configuración del Bot de Telegram ---
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN no encontrado.');
  process.exit(1);
}
const bot = new TelegramBot(token, { polling: true });
console.log('Bot de Telegram inicializado...');

// --- Super Administrador ---
const SUPER_ADMIN_ID = parseInt(process.env.SUPER_ADMIN_TELEGRAM_ID, 10);
if (!SUPER_ADMIN_ID) {
  console.warn('Advertencia: SUPER_ADMIN_TELEGRAM_ID no configurado.');
}

// --- Inicialización de la Base de Datos ---
(async () => {
  try {
    const connected = await db.testConnection();
    if (!connected) {
        console.error('No se pudo conectar a la BD. Abortando.');
        process.exit(1);
    }
    await db.initializeSchema();
    console.log('Base de datos lista.');
    if (SUPER_ADMIN_ID) {
      const admin = await db.findAdminByTelegramId(SUPER_ADMIN_ID);
      let saU='SuperAdmin', saF='Super', saL='Admin';
      try { const su = await bot.getChat(SUPER_ADMIN_ID); saU=su.username||saU; saF=su.first_name||saF; saL=su.last_name||'';}
      catch(e){ console.warn(`Warn SUPER_ADMIN_ID: ${e.message}`); }
      if(!admin) { await db.addAdmin(SUPER_ADMIN_ID,saU,saF,saL); console.log(`SuperAdmin ${saU} reg.`); }
      else if(!admin.is_active) { await db.setAdminStatus(SUPER_ADMIN_ID,true); console.log(`SuperAdmin ${admin.username||SUPER_ADMIN_ID} reactivado.`); }
      else { await db.addAdmin(SUPER_ADMIN_ID,saU,saF,saL); console.log(`SuperAdmin ${saU} datos act.`); }
    }
  } catch (error) { console.error('Error Init BD:', error); process.exit(1); }
})();

// --- Middleware de Autenticación ---
const isAdmin = async (telegramId) => {
  if(!telegramId) return false;
  const admin = await db.findAdminByTelegramId(telegramId);
  return admin && admin.is_active;
};

// --- Definiciones de Teclados Inline ---
const mainMenuText = "👋 *Bot de Gestión de Repartos*\n\nSelecciona una opción del menú principal:";

const getMainMenuKeyboard = (userId) => {
  const keyboard = [
    [{ text: '👤 Clientes', callback_data: 'menu_clientes' }],
    [{ text: '📦 Pedidos', callback_data: 'menu_pedidos' }],
  ];
  if (userId === SUPER_ADMIN_ID) {
    keyboard.push([{ text: '⚙️ Administradores', callback_data: 'menu_admins' }]);
  }
  keyboard.push([{ text: '❓ Ayuda (Comandos de Texto)', callback_data: 'menu_ayuda' }]);
  return { inline_keyboard: keyboard };
};

const getClientMenuKeyboard = () => ({
    inline_keyboard: [
        [{ text: '📋 Listar Clientes', callback_data: 'client_menu_list' }],
        [{ text: '➕ Añadir Nuevo Cliente', callback_data: 'client_menu_add_prompt' }],
        [{ text: ' Volver al Menú Principal', callback_data: 'main_menu_back' }]
    ]
});

const getOrderMenuKeyboard = () => ({
    inline_keyboard: [
        [{ text: '📋 Listar Pedidos', callback_data: 'order_menu_list' }],
        [{ text: '➕ Crear Nuevo Pedido', callback_data: 'order_menu_add_prompt' }],
        [{ text: ' Volver al Menú Principal', callback_data: 'main_menu_back' }]
    ]
});

const getAdminManagementMenuKeyboard = () => ({
    inline_keyboard: [
        [{ text: '📋 Listar Administradores', callback_data: 'admin_menu_list_admins' }],
        [{ text: '➕ Añadir Administrador', callback_data: 'admin_menu_add_admin_prompt' }],
        [{ text: ' Volver al Menú Principal', callback_data: 'main_menu_back' }]
    ]
});


// --- Funciones Helper para Comandos ---
const sendMainMenu = async (chatId, userId, messageId = null) => {
  if (!(await isAdmin(userId))) {
    return bot.sendMessage(chatId, "Acceso denegado. Contacta a un administrador.");
  }
  const opts = { reply_markup: getMainMenuKeyboard(userId), parse_mode: 'Markdown' };
  if (messageId) {
    try {
      await bot.editMessageText(mainMenuText, { chat_id: chatId, message_id: messageId, ...opts });
    } catch (e) { // Si el mensaje no se puede editar (ej. es muy viejo), envía uno nuevo
      console.warn("Error editando mensaje a menú principal, enviando nuevo:", e.message);
      bot.sendMessage(chatId, mainMenuText, opts);
    }
  } else {
    bot.sendMessage(chatId, mainMenuText, opts);
  }
};

// --- Comandos Principales del Bot ---
bot.onText(/\/start(?:@\w+)?/, async (msg) => sendMainMenu(msg.chat.id, msg.from.id));
bot.onText(/\/menu(?:@\w+)?/, async (msg) => sendMainMenu(msg.chat.id, msg.from.id));

const helpMessage = `📖 *Lista de Comandos de Texto Disponibles*

*Administración de Usuarios (Admins):*
/addadmin \`<ID_TELEGRAM>\` \`<NOMBRE>\` \`<APELLIDO>\`
/listadmins
/setadminstatus \`<ID_TELEGRAM>\` \`active|inactive\`

*Gestión de Clientes (Admins):*
/addclient \`<nombre>\` \`<apellido>\` \`<teléfono>\` \`<dirección>\` \`| [notas]\` \`| [id_telegram]\`
/listclients \`[página]\` \`[activos|inactivos|todos]\` \`[búsqueda]\`
/viewclient \`<ID_CLIENTE | TELÉFONO>\`
/editclient \`<ID_CLIENTE | TELÉFONO>\` \`<campo>\` \`<nuevo_valor>\`
  Campos: \`nombre\`, \`apellido\`, \`telefono\`, \`direccion\`, \`notas\`, \`telegram_id\`, \`activo\` (true/false)
/setclientstatus \`<ID_CLIENTE | TELÉFONO>\` \`active|inactive\`

*Gestión de Pedidos (Admins):*
/neworder \`<cliente>\` \`<item>:<cant> [item2:cant...]\` \`| [notas]\` \`| [dirección_alt]\` \`| [YYYY-MM-DD]\` \`| [pago]\`
/listorders \`[cliente]\` \`[estado]\` \`[pág]\` \`[desde]\` \`[hasta]\`
/vieworder \`<ID_PEDIDO>\`
/setorderstatus \`<ID_PEDIDO>\` \`<estado>\` (Estados: ${ESTADOS_PEDIDO_STRING})
/editorder \`<ID_PEDIDO>\` \`<campo>\` \`<valor>\`
  Campos: \`notas_pedido\`, \`direccion_entrega\`, \`fecha_entrega_estimada\` (YYYY-MM-DD o null), \`metodo_pago\`.

Puedes navegar usando los botones del /menu o usar estos comandos directamente.`;

bot.onText(/\/help(?:@\w+)?/, async (msg) => {
  const userIsAdmin = await isAdmin(msg.from.id);
  if (!userIsAdmin && msg.chat.id.toString() !== process.env.SUPER_ADMIN_TELEGRAM_ID) { // Permitir al Super Admin ver /help aunque no esté en BD aún
      return bot.sendMessage(msg.chat.id, "Contacta a un administrador para asistencia.");
  }
  bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
});


// --- Comandos de Texto (sin cambios significativos, se mantienen como alternativa) ---
// ... (Comandos /addadmin, /listadmins, /setadminstatus)
// ... (Comandos /addclient, /listclients (sin paginación por botón aquí), /viewclient, /editclient, /setclientstatus)
// ... (Comandos /neworder, /listorders (sin paginación por botón aquí), /vieworder, /setorderstatus, /editorder)
// (Se omiten aquí por brevedad, pero están en el código completo anterior)
// Comando para añadir un nuevo administrador
bot.onText(/\/addadmin(?:@\w+)?\s+(\d+)\s+([\wáéíóúÁÉÍÓÚñÑ\s]+)\s+([\wáéíóúÁÉÍÓÚñÑ\s]+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const requesterId = msg.from.id;

  if (requesterId !== SUPER_ADMIN_ID) {
    return bot.sendMessage(chatId, 'No tienes permiso para ejecutar este comando. Solo el Super Administrador puede añadir nuevos administradores.');
  }

  const newAdminTelegramId = parseInt(match[1], 10);
  const newAdminFirstName = match[2].trim();
  const newAdminLastName = match[3].trim();

  if (isNaN(newAdminTelegramId)) {
    return bot.sendMessage(chatId, 'El ID de Telegram del nuevo administrador no es válido.');
  }

  try {
    let newAdminUsername = '';
    try {
      const newAdminChat = await bot.getChat(newAdminTelegramId);
      newAdminUsername = newAdminChat.username || '';
    } catch (e) {
      console.warn(`No se pudo obtener información de chat para el ID ${newAdminTelegramId}: ${e.message}`);
    }

    const existingAdmin = await db.findAdminByTelegramId(newAdminTelegramId);
    if (existingAdmin && existingAdmin.is_active) {
      await db.addAdmin(newAdminTelegramId, newAdminUsername, newAdminFirstName, newAdminLastName);
       return bot.sendMessage(chatId, `El administrador con ID ${newAdminTelegramId} ya estaba activo. Sus datos (nombre, apellido, username) han sido actualizados.`);
    }

    await db.addAdmin(newAdminTelegramId, newAdminUsername, newAdminFirstName, newAdminLastName);
    bot.sendMessage(chatId, `Administrador ${newAdminFirstName} ${newAdminLastName} (ID: ${newAdminTelegramId}, @${newAdminUsername || 'N/A'}) añadido y activado correctamente.`);
  } catch (error) {
    console.error('Error al añadir administrador:', error);
    bot.sendMessage(chatId, 'Ocurrió un error al intentar añadir el administrador. Revisa la consola del bot.');
  }
});
bot.onText(/\/listadmins(?:@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const requesterId = msg.from.id;
  if (!(await isAdmin(requesterId))) return bot.sendMessage(chatId, 'No tienes permiso.');
  try {
    const admins = await db.getAllAdmins();
    if (admins.length === 0) return bot.sendMessage(chatId, 'No hay administradores.');
    let response = '📜 *Lista de Administradores:*\n\n';
    admins.forEach(admin => {
      response += `*Nombre:* ${admin.first_name || ''} ${admin.last_name || ''}\n`;
      response += `*Usuario:* @${admin.username || 'N/A'}\n*ID:* \`${admin.telegram_id}\`\n`;
      response += `*Estado:* ${admin.is_active ? '✅ Activo' : '❌ Inactivo'}\n----------------------\n`;
    });
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) { console.error('Error listadmins:', error); bot.sendMessage(chatId, 'Error al listar admins.'); }
});
bot.onText(/\/setadminstatus(?:@\w+)?\s+(\d+)\s+(active|inactive)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const requesterId = msg.from.id;
  if (requesterId !== SUPER_ADMIN_ID) return bot.sendMessage(chatId, 'Solo Super Admin.');

  const adminIdToUpdate = parseInt(match[1], 10);
  const status = match[2].toLowerCase() === 'active';
  if (isNaN(adminIdToUpdate)) return bot.sendMessage(chatId, 'ID admin inválido.');
  if (adminIdToUpdate === SUPER_ADMIN_ID && !status) return bot.sendMessage(chatId, 'No puedes desactivar Super Admin.');

  try {
    const target = await db.findAdminByTelegramId(adminIdToUpdate);
    if (!target) return bot.sendMessage(chatId, `Admin ID \`${adminIdToUpdate}\` no encontrado.`);
    const updated = await db.setAdminStatus(adminIdToUpdate, status);
    if (updated) bot.sendMessage(chatId, `Admin ${updated.first_name || ''} (@${updated.username || 'N/A'}) ID \`${adminIdToUpdate}\` ahora *${status ? 'ACTIVO' : 'INACTIVO'}*.`, { parse_mode: 'Markdown' });
    else bot.sendMessage(chatId, `No se pudo actualizar admin ID \`${adminIdToUpdate}\`.`);
  } catch (error) { console.error('Error setadminstatus:', error); bot.sendMessage(chatId, 'Error al cambiar estado.');}
});
bot.onText(/\/addclient(?:@\w+)?\s+([\w\sáéíóúÁÉÍÓÚñÑ]+)\s+([\w\sáéíóúÁÉÍÓÚñÑ]+)\s+([\d\s\+\-\(\)]+)\s+([^|]+)(?:\s*\|\s*([^|]*))?(?:\s*\|\s*(\d*))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const requesterId = msg.from.id;
  if (!(await isAdmin(requesterId))) return bot.sendMessage(chatId, 'No tienes permiso.');

  const nombre = match[1].trim();
  const apellido = match[2].trim();
  const telefono = match[3].trim();
  const direccion = match[4].trim();
  const notas = match[5] ? match[5].trim() : null;
  let telegram_id = match[6] ? parseInt(match[6].trim(), 10) : null;
  if (match[6] && isNaN(telegram_id)) return bot.sendMessage(chatId, "ID Telegram inválido.");
  if (!nombre || !apellido || !telefono || !direccion) return bot.sendMessage(chatId, "Faltan datos. Uso: /addclient <nombre> <apellido> <teléfono> <dirección> | [notas] | [id_telegram]");

  try {
    const clientData = { nombre, apellido, telefono, direccion, notas, telegram_id };
    const newClient = await db.addClient(clientData, requesterId);
    bot.sendMessage(chatId, `Cliente *${newClient.nombre} ${newClient.apellido}* (ID: ${newClient.id}) añadido/actualizado.\nTel: \`${newClient.telefono}\`\nDir: ${newClient.direccion}${newClient.telegram_id ? `\nTG ID: \`${newClient.telegram_id}\`` : ''}${newClient.notas ? `\nNotas: ${newClient.notas}` : ''}`, { parse_mode: 'Markdown' });
  } catch (error) { console.error('Error addclient:', error); bot.sendMessage(chatId, `Error: ${error.message}`); }
});
bot.onText(/\/listclients(?:@\w+)?(?:\s+(\d+))?(?:\s+(activos|inactivos|todos))?(?:\s+(.*))?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const requesterId = msg.from.id;
  if (!(await isAdmin(requesterId))) return bot.sendMessage(chatId, 'No tienes permiso.');

  const page = match[1] ? parseInt(match[1], 10) : 1;
  const statusStr = match[2] ? match[2].toLowerCase() : 'activos';
  const searchTerm = match[3] ? match[3].trim() : null;
  let activeOnly = true;
  if (statusStr === 'inactivos') activeOnly = false;
  if (statusStr === 'todos') activeOnly = null;
  const limit = 5;

  try {
    const { clients, total } = await db.getAllClients(page, limit, activeOnly, searchTerm);
    if (total === 0) return bot.sendMessage(chatId, `No hay clientes ${statusStr}${searchTerm ? ` para "${searchTerm}"` : ''}.`);
    let resp = `👥 *Clientes ${statusStr}${searchTerm ? ` ("${searchTerm}")` : ''}* (P ${page}/${Math.ceil(total/limit)})\n\n`;
    clients.forEach(c => {
      resp += `*ID:* \`${c.id}\` - ${c.nombre} ${c.apellido||''}\n*Tel:* ${c.telefono||'N/A'} | *Activo:* ${c.activo ? '✅':'❌'}\n*Dir:* ${c.direccion}\n${c.telegram_id ? `*TG ID:* \`${c.telegram_id}\`\n`:''}--------------------\n`;
    });
    resp += `Total: ${total}. Mostrando ${clients.length}.`;
    const kb = []; if(page > 1) kb.push({text:`⬅️ P ${page-1}`, callback_data:`listclients_page_${page-1}_${statusStr}_${searchTerm||''}`}); if(page < Math.ceil(total/limit)) kb.push({text:`P ${page+1} ➡️`, callback_data:`listclients_page_${page+1}_${statusStr}_${searchTerm||''}`});
    bot.sendMessage(chatId, resp, { parse_mode: 'Markdown', reply_markup: kb.length > 0 ? {inline_keyboard: [kb]} : {} });
  } catch (e) { console.error('Error listclients:', e); bot.sendMessage(chatId, 'Error listando clientes.');}
});
bot.onText(/\/viewclient(?:@\w+)?\s+([^\s]+)/, async (msg, match) => {
  const chatId = msg.chat.id; const rid = msg.from.id;
  if (!(await isAdmin(rid))) return bot.sendMessage(chatId, 'No permitido.');
  const ident = match[1]; let client;
  try {
    if (/^\d+$/.test(ident)) client = await db.findClientById(parseInt(ident));
    else client = await db.findClientByPhone(ident);
    if (!client) return bot.sendMessage(chatId, `Cliente \`${ident}\` no encontrado.`);
    let r = `👤 *Cliente ID: ${client.id}*\n\n*Nombre:* ${client.nombre} ${client.apellido||''}\n*Tel:* \`${client.telefono||'N/A'}\`\n*Dir:* ${client.direccion}\n*TG ID:* ${client.telegram_id?`\`${client.telegram_id}\``:'N/A'}\n*Notas:* ${client.notas||'N/A'}\n*Estado:* ${client.activo?'✅ Activo':'❌ Inactivo'}\n*Creado por:* @${client.admin_username||'N/A'} (ID DB: ${client.creado_por_admin_id||'N/A'})\n*Creado:* ${new Date(client.fecha_creacion).toLocaleString('es-ES')}\n*Actualizado:* ${new Date(client.fecha_actualizacion).toLocaleString('es-ES')}`;
    bot.sendMessage(chatId, r, {parse_mode:'Markdown'});
  } catch(e){console.error('Error viewclient:',e); bot.sendMessage(chatId, 'Error viendo cliente.');}
});
bot.onText(/\/editclient(?:@\w+)?\s+([^\s]+)\s+([\w_]+)\s+(.+)/si, async (msg, match) => {
  const chatId = msg.chat.id; const rid = msg.from.id;
  if (!(await isAdmin(rid))) return bot.sendMessage(chatId, 'No permitido.');
  const ident = match[1]; const field = match[2].toLowerCase(); let val = match[3].trim();
  const allow = ['nombre','apellido','telefono','direccion','notas','telegram_id','activo'];
  if(!allow.includes(field)) return bot.sendMessage(chatId, `Campo inválido. Usar: ${allow.join(', ')}`);
  let client;
  try {
    if (/^\d+$/.test(ident)) client = await db.findClientById(parseInt(ident));
    else client = await db.findClientByPhone(ident);
    if (!client) return bot.sendMessage(chatId, `Cliente \`${ident}\` no encontrado.`);
    const upd = {};
    if(field==='activo'){ if(['true','1','active','activo'].includes(val.toLowerCase()))upd.activo=true; else if(['false','0','inactive','inactivo'].includes(val.toLowerCase()))upd.activo=false; else return bot.sendMessage(chatId,"Valor activo: true/false.");}
    else if(field==='telegram_id'){if(['null','none','quitar',''].includes(val.toLowerCase()))upd.telegram_id=null; else if(!/^\d+$/.test(val)) return bot.sendMessage(chatId,"TG ID debe ser número o null."); else upd.telegram_id=parseInt(val);}
    else if(field==='notas' && ['null','none','quitar',''].includes(val.toLowerCase())) upd.notas=null;
    else upd[field]=val;
    if(Object.keys(upd).length===0) return bot.sendMessage(chatId,"No hay cambios válidos.");
    const updated = await db.updateClient(client.id, upd);
    bot.sendMessage(chatId, `Cliente ID \`${client.id}\` actualizado. Campo \`${field}\` es \`${updated[field]===null?'NINGUNO':updated[field]}\`.`, {parse_mode:'Markdown'});
  } catch(e){console.error('Error editclient:',e); bot.sendMessage(chatId, `Error: ${e.message}`);}
});
bot.onText(/\/setclientstatus(?:@\w+)?\s+([^\s]+)\s+(active|inactive)/i, async (msg, match) => {
  const chatId = msg.chat.id; const rid = msg.from.id;
  if (!(await isAdmin(rid))) return bot.sendMessage(chatId, 'No permitido.');
  const ident = match[1]; const status = match[2].toLowerCase()==='active'; let client;
  try {
    if (/^\d+$/.test(ident)) client = await db.findClientById(parseInt(ident));
    else client = await db.findClientByPhone(ident);
    if (!client) return bot.sendMessage(chatId, `Cliente \`${ident}\` no encontrado.`);
    const updated = await db.setClientStatus(client.id, status);
    bot.sendMessage(chatId, `Estado cliente ${updated.nombre} (ID: \`${updated.id}\`) es *${status?'ACTIVO':'INACTIVO'}*.`, {parse_mode:'Markdown'});
  } catch(e){console.error('Error setclientstatus:',e); bot.sendMessage(chatId, `Error: ${e.message}`);}
});
function parseOrderItems(itemsString) {
  const items = [];
  const itemEntries = itemsString.toLowerCase().match(/[\wáéíóúñÑ\d]+:\d+/g);
  if (!itemEntries) return { error: "Formato items: 'producto:cantidad producto2:cantidad'." };
  for (const entry of itemEntries) {
    const [alias, cantidadStr] = entry.split(':');
    const cantidad = parseInt(cantidadStr, 10);
    if (isNaN(cantidad) || cantidad <= 0) return { error: `Cantidad inválida para '${alias}'.` };
    const p = PRODUCTOS_DISPONIBLES.find(prod => prod.id.toLowerCase() === alias || (prod.alias && prod.alias.includes(alias)));
    if (!p) return { error: `Producto '${alias}' no encontrado. IDs: ${PRODUCTOS_DISPONIBLES.map(pr=>pr.id).join(', ')}` };
    items.push({ nombre_producto: p.nombre, cantidad: cantidad, precio_unitario: p.precio });
  }
  if (items.length === 0) return { error: "No se especificaron items válidos."};
  return { parsedItems: items };
}
bot.onText(/\/neworder(?:@\w+)?\s+([^\s]+)\s+([^|]+)(?:\s*\|\s*([^|]*))?(?:\s*\|\s*([^|]*))?(?:\s*\|\s*([\d-]*))?(?:\s*\|\s*([\w\s]*))?/i, async (msg, match) => {
  const chatId = msg.chat.id; const rid = msg.from.id;
  if (!(await isAdmin(rid))) return bot.sendMessage(chatId, 'No permitido.');
  const cIdent = match[1]; const itemsStr = match[2].trim();
  const notas = match[3]?match[3].trim():null; let dirAlt = match[4]?match[4].trim():null;
  const fechaEstStr = match[5]?match[5].trim():null; const metodoPago = match[6]?match[6].trim():null;
  let cliente;
  try {
    if (/^\d+$/.test(cIdent)) cliente = await db.findClientById(parseInt(cIdent));
    else cliente = await db.findClientByPhone(cIdent);
    if (!cliente) return bot.sendMessage(chatId, `Cliente '${cIdent}' no encontrado.`);
    if (!cliente.activo) return bot.sendMessage(chatId, `Cliente ${cliente.nombre} (ID: ${cliente.id}) inactivo.`);
  } catch (e) { return bot.sendMessage(chatId, `Error buscando cliente: ${e.message}`); }
  const { parsedItems, error: itemsError } = parseOrderItems(itemsStr);
  if (itemsError) return bot.sendMessage(chatId, itemsError);
  let fechaEst = null;
  if (fechaEstStr && fechaEstStr !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEstStr) || isNaN(new Date(fechaEstStr))) return bot.sendMessage(chatId, "Fecha entrega YYYY-MM-DD.");
      fechaEst = new Date(fechaEstStr);
  }
  const orderData = { cliente_id: cliente.id, direccion_entrega: dirAlt || cliente.direccion, notas_pedido: notas, metodo_pago: metodoPago, fecha_entrega_estimada: fechaEst };
  try {
    const pedido = await db.createOrder(orderData, parsedItems, rid);
    let r = `✅ *Pedido #${pedido.id} creado para ${cliente.nombre} ${cliente.apellido}*\nDir: ${pedido.direccion_entrega}\nEstado: ${pedido.estado.toUpperCase()}\n`;
    if(pedido.fecha_entrega_estimada) r += `Entrega Est: ${new Date(pedido.fecha_entrega_estimada).toLocaleDateString('es-ES')}\n`
    r += `\n*Items:*\n`; pedido.items.forEach(i => {r += `- ${i.nombre_producto}: ${i.cantidad} x $${parseFloat(i.precio_unitario).toFixed(2)} = $${parseFloat(i.subtotal).toFixed(2)}\n`;});
    r += `*Total: $${parseFloat(pedido.total_pedido).toFixed(2)}*\n`;
    if(pedido.notas_pedido) r += `Notas: ${pedido.notas_pedido}\n`; if(pedido.metodo_pago) r += `Pago: ${pedido.metodo_pago}\n`;
    bot.sendMessage(chatId, r, { parse_mode: 'Markdown' });
  } catch (e) { console.error("Error neworder:", e); bot.sendMessage(chatId, `Error creando pedido: ${e.message}`); }
});
bot.onText(/\/listorders(?:@\w+)?(?:\s+([^\s]+))?(?:\s+([\w]+))?(?:\s+(\d+))?(?:\s+([\d-]+))?(?:\s+([\d-]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id; const rid = msg.from.id;
    if (!(await isAdmin(rid))) return bot.sendMessage(chatId, 'No permitido.');
    const clientIdentifier = match[1];
    const estadoFilter = match[2]?.toLowerCase();
    const page = match[3] ? parseInt(match[3]) : 1;
    const fechaDesdeStr = match[4];
    const fechaHastaStr = match[5];
    const filters = {};
    const limit = 5;
    if(clientIdentifier && clientIdentifier.toLowerCase()!=='todos' && clientIdentifier.toLowerCase()!=='todo'){
        let cliente;
        if(/^\d+$/.test(clientIdentifier)) cliente = await db.findClientById(parseInt(clientIdentifier));
        else cliente = await db.findClientByPhone(clientIdentifier);
        if(cliente) filters.cliente_id = cliente.id;
        else return bot.sendMessage(chatId,`Cliente '${clientIdentifier}' no encontrado.`);
    }
    if(estadoFilter && estadoFilter!=='todos' && estadoFilter!=='todo'){
        if(ESTADOS_PEDIDO_ARRAY.includes(estadoFilter)) filters.estado = estadoFilter;
        else return bot.sendMessage(chatId,`Estado '${estadoFilter}' inválido. Usar: ${ESTADOS_PEDIDO_STRING}`);
    }
    if(fechaDesdeStr){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(fechaDesdeStr)||isNaN(new Date(fechaDesdeStr))) return bot.sendMessage(chatId,"Fecha DESDE YYYY-MM-DD.");
        filters.fecha_desde = fechaDesdeStr;
    }
    if(fechaHastaStr){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(fechaHastaStr)||isNaN(new Date(fechaHastaStr))) return bot.sendMessage(chatId,"Fecha HASTA YYYY-MM-DD.");
        filters.fecha_hasta = fechaHastaStr;
    }
    try {
        const {orders,total} = await db.getAllOrders(filters,page,limit);
        if(total===0) return bot.sendMessage(chatId, 'No hay pedidos que coincidan con los filtros aplicados.');
        let filterSummary = '';
        if (filters.cliente_id) filterSummary += `Cliente ID: \`${filters.cliente_id}\` | `;
        if (filters.estado) filterSummary += `Estado: \`${filters.estado.toUpperCase()}\` | `;
        if (filters.fecha_desde) filterSummary += `Desde: \`${filters.fecha_desde}\` | `;
        if (filters.fecha_hasta) filterSummary += `Hasta: \`${filters.fecha_hasta}\` | `;
        if (filterSummary.endsWith(' | ')) filterSummary = filterSummary.slice(0, -3);
        let responseText =`📦 *Lista de Pedidos*\n`;
        if (filterSummary) responseText += `Filtros: ${filterSummary}\n`;
        responseText += `(Página ${page}/${Math.ceil(total/limit)})\n\n`;
        orders.forEach(o => {
            responseText += `*ID:* \`${o.id}\` Cliente: ${o.cliente_nombre} ${o.cliente_apellido||''}\n`;
            responseText += `Fecha: ${new Date(o.fecha_pedido).toLocaleDateString('es-ES')} | Estado: *${o.estado.toUpperCase()}*\n`;
            responseText += `Total: $${parseFloat(o.total_pedido).toFixed(2)}\n--------------------\n`;
        });
        responseText +=`Total de pedidos: ${total}. Mostrando ${orders.length}.`;
        bot.sendMessage(chatId, responseText, {parse_mode:'Markdown'});
    } catch(e) { console.error("Error listorders:", e); bot.sendMessage(chatId,`Error al listar pedidos: ${e.message}`); }
});
bot.onText(/\/vieworder(?:@\w+)?\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id; const rid = msg.from.id; if(!(await isAdmin(rid)))return bot.sendMessage(chatId,'No permitido.');
    const pId = parseInt(match[1]);
    try {
        const p = await db.getOrderById(pId); if(!p)return bot.sendMessage(chatId,`Pedido \`${pId}\` no encontrado.`);
        let adminName = 'N/A';
        if (p.admin_username) { adminName = `@${p.admin_username}`; if (p.admin_first_name) { adminName += ` (${p.admin_first_name})`; }
        } else if (p.admin_first_name) { adminName = p.admin_first_name; }
        let responseText =`🧾 *Detalles del Pedido #${p.id}*\n\n`;
        responseText += `*Cliente:* ${p.cliente_nombre} ${p.cliente_apellido||''} (Tel: \`${p.cliente_telefono||'N/A'}\`)\n`;
        responseText += `*Fecha Pedido:* ${new Date(p.fecha_pedido).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short'})}\n`;
        responseText += `*Estado:* *${p.estado.toUpperCase()}*\n`;
        responseText += `*Dirección Entrega:* ${p.direccion_entrega}\n`;
        if(p.fecha_entrega_estimada) responseText += `*Entrega Estimada:* ${new Date(p.fecha_entrega_estimada).toLocaleDateString('es-ES')}\n`;
        if(p.fecha_entrega_real) responseText += `*Entregado el:* ${new Date(p.fecha_entrega_real).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short'})}\n`;
        responseText += `\n*Items del Pedido:*\n`;
        p.items.forEach(i => { responseText += `- ${i.nombre_producto}: ${i.cantidad} x $${parseFloat(i.precio_unitario).toFixed(2)} = $${parseFloat(i.subtotal).toFixed(2)}\n`; });
        responseText += `\n*Total Pedido: $${parseFloat(p.total_pedido).toFixed(2)}*\n`;
        if(p.notas_pedido) responseText += `*Notas:* ${p.notas_pedido}\n`;
        if(p.metodo_pago) responseText += `*Método Pago:* ${p.metodo_pago}\n`;
        if(p.admin_id) responseText += `*Admin (Registró/Modificó):* ${adminName}\n`;
        responseText += `*Última Actualización:* ${new Date(p.fecha_actualizacion).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short'})}\n`;
        bot.sendMessage(chatId, responseText, {parse_mode:'Markdown'});
    } catch(e) { console.error(`Error vieworder ${pId}:`,e); bot.sendMessage(chatId,`Error al ver el pedido: ${e.message}`); }
});
bot.onText(/\/setorderstatus(?:@\w+)?\s+(\d+)\s+([\w_]+)/i, async (msg, match) => {
    const chatId = msg.chat.id; const rid = msg.from.id; if(!(await isAdmin(rid)))return bot.sendMessage(chatId,'No permitido.');
    const pId = parseInt(match[1]); const nEstado = match[2].toLowerCase();
    if(!ESTADOS_PEDIDO_ARRAY.includes(nEstado)) return bot.sendMessage(chatId,`Estado '${nEstado}' inválido. Usar: ${ESTADOS_PEDIDO_STRING}`);
    try {
        const pUpd = await db.updateOrderStatus(pId,nEstado,rid);
        bot.sendMessage(chatId,`Pedido #${pId} actualizado a *${pUpd.estado.toUpperCase()}*.`,{parse_mode:'Markdown'});
    }catch(e){console.error(`Error setorderstatus ${pId}:`,e); bot.sendMessage(chatId,`Error: ${e.message}`);}
});
bot.onText(/\/editorder(?:@\w+)?\s+(\d+)\s+([\w_]+)\s+(.+)/si, async (msg, match) => {
    const chatId = msg.chat.id; const rid = msg.from.id; if(!(await isAdmin(rid)))return bot.sendMessage(chatId,'No permitido.');
    const pId = parseInt(match[1]); const campo = match[2].toLowerCase(); let valor = match[3].trim();
    const camposOk = ['notas_pedido','direccion_entrega','fecha_entrega_estimada','metodo_pago'];
    if(!camposOk.includes(campo)) return bot.sendMessage(chatId,`Campo '${campo}' no editable. Usar: ${camposOk.join(', ')}`);
    const upd = {};
    if(campo==='fecha_entrega_estimada'){if(valor.toLowerCase()==='null'||valor==='')upd.fecha_entrega_estimada=null; else if(!/^\d{4}-\d{2}-\d{2}$/.test(valor)||isNaN(new Date(valor)))return bot.sendMessage(chatId,"Fecha YYYY-MM-DD o 'null'."); else upd.fecha_entrega_estimada=new Date(valor);}
    else if((campo==='notas_pedido'||campo==='metodo_pago')&&(valor.toLowerCase()==='null'||valor.toLowerCase()==='quitar'||valor===''))upd[campo]=null;
    else upd[campo]=valor;
    if(Object.keys(upd).length===0 && !( (campo==='notas_pedido'||campo==='metodo_pago')&&(valor.toLowerCase()==='null'||valor.toLowerCase()==='quitar'||valor==='')) && !(campo==='fecha_entrega_estimada' && (valor.toLowerCase()==='null'||valor==='')) ) {
        return bot.sendMessage(chatId,"No hay datos válidos para actualizar o el valor es el mismo.");
    }
    try {
        const pedidoActualizado = await db.updateOrderDetails(pId,upd);
        const valorMostrado = upd[campo] === null ? 'NINGUNO/A' : upd[campo] instanceof Date ? upd[campo].toLocaleDateString('es-CA') : upd[campo];
        bot.sendMessage(chatId,`Pedido #${pId}: campo '${campo}' actualizado a '${valorMostrado}'.`);
    }catch(e){console.error(`Error editorder ${pId}:`,e); bot.sendMessage(chatId,`Error: ${e.message}`);}
});


// --- Manejador de Callback Queries ---
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const chatId = msg.chat.id;

  if (!(await isAdmin(userId))) {
    return bot.answerCallbackQuery(callbackQuery.id, { text: 'No tienes permiso.' });
  }

  await bot.answerCallbackQuery(callbackQuery.id);
  console.log(`Callback: ${data}, User: ${userId}, Chat: ${chatId}, MsgID: ${msg.message_id}`);

  // --- Menú Principal ---
  if (data === 'main_menu_back' || data === 'main_menu_show') {
    return sendMainMenu(chatId, userId, msg.message_id);
  }
  if (data === 'menu_clientes') {
    return bot.editMessageText("Gestión de Clientes:", { chat_id: chatId, message_id: msg.message_id, reply_markup: getClientMenuKeyboard(), parse_mode: 'Markdown' });
  }
  if (data === 'menu_pedidos') {
    return bot.editMessageText("Gestión de Pedidos:", { chat_id: chatId, message_id: msg.message_id, reply_markup: getOrderMenuKeyboard(), parse_mode: 'Markdown' });
  }
  if (data === 'menu_admins') {
    if (userId === SUPER_ADMIN_ID) {
      return bot.editMessageText("Gestión de Administradores:", { chat_id: chatId, message_id: msg.message_id, reply_markup: getAdminManagementMenuKeyboard(), parse_mode: 'Markdown' });
    } else { return bot.sendMessage(chatId, "Acceso denegado."); }
  }
  if (data === 'menu_ayuda') {
    // Editar el mensaje actual para quitar los botones y luego enviar la ayuda.
    try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id }); } catch(e) { console.warn("Error quitando teclado ayuda:", e.message); }
    return bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  }

  // --- Submenús Clientes ---
  if (data === 'client_menu_list') {
    try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id }); } catch(e) { console.warn("Error quitando teclado:", e.message); }
    return bot.sendMessage(chatId, "Para listar clientes, usa el comando con filtros si es necesario:\n`/listclients [página] [activos|inactivos|todos] [búsqueda]`\nEj: `/listclients` (muestra activos pág 1)\nEj: `/listclients 1 todos`", { parse_mode: 'Markdown' });
  }
  if (data === 'client_menu_add_prompt') {
    try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id }); } catch(e) { console.warn("Error quitando teclado:", e.message); }
    return bot.sendMessage(chatId, "Usa el comando para añadir cliente:\n`/addclient <nombre> <apellido> <teléfono> <dirección> | [notas] | [id_telegram]`", { parse_mode: 'Markdown' });
  }

  // --- Submenús Pedidos ---
  if (data === 'order_menu_list') {
     try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id }); } catch(e) { console.warn("Error quitando teclado:", e.message); }
    return bot.sendMessage(chatId, "Para listar pedidos, usa:\n`/listorders [cliente] [estado] [pág] [desde] [hasta]`\nEj: `/listorders` (todos los pedidos pág 1)\nEj: `/listorders clienteID pendiente`", { parse_mode: 'Markdown' });
  }
  if (data === 'order_menu_add_prompt') {
    try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id }); } catch(e) { console.warn("Error quitando teclado:", e.message); }
    return bot.sendMessage(chatId, "Usa el comando para nuevo pedido:\n`/neworder <cliente> <item>:<cant> [item2:cant...] | [notas] | [dir_alt] | [YYYY-MM-DD] | [pago]`", { parse_mode: 'Markdown' });
  }

  // --- Submenús Admin ---
  if (data === 'admin_menu_list_admins') {
    try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id }); } catch(e) { console.warn("Error quitando teclado:", e.message); }
    return bot.sendMessage(chatId, "Usa el comando `/listadmins` para ver la lista.", { parse_mode: 'Markdown' });
  }
  if (data === 'admin_menu_add_admin_prompt') {
    try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msg.message_id }); } catch(e) { console.warn("Error quitando teclado:", e.message); }
    return bot.sendMessage(chatId, "Usa el comando para añadir admin:\n`/addadmin <ID_TELEGRAM> <NOMBRE> <APELLIDO>`", { parse_mode: 'Markdown' });
  }


  // Paginación de /listclients (ya existente)
  if (data.startsWith('listclients_page_')) {
    const parts = data.split('_'); const page = parseInt(parts[2]); const statusStr = parts[3]; const term = parts.slice(4).join('_') || null;
    let active = true; if(statusStr === 'inactivos') active=false; if(statusStr === 'todos') active=null; const limit = 5;
    try {
        const {clients, total} = await db.getAllClients(page,limit,active,term===''?null:term);
        if(total===0 && page===1) { // Solo editar si no hay nada en la primera página
             try { await bot.editMessageText(`No hay clientes ${statusStr}${term && term !== 'null' && term !=='' ?` para "${term}"`:''}.`, {chat_id:msg.chat.id, message_id:msg.message_id, parse_mode:'Markdown', reply_markup: {inline_keyboard: [[{text:' Volver al Menú Clientes', callback_data:'menu_clientes'}]]}}); } catch(e){/*ignore*/}
             return;
        }
        let resp = `👥 *Clientes ${statusStr}${term && term !== 'null' && term !=='' ?` ("${term}")`:''}* (P ${page}/${Math.ceil(total/limit)})\n\n`;
        clients.forEach(c=>{resp+=`*ID:* \`${c.id}\` - ${c.nombre} ${c.apellido||''}\n*Tel:* ${c.telefono||'N/A'} | *Activo:* ${c.activo ? '✅':'❌'}\n*Dir:* ${c.direccion}\n${c.telegram_id ? `*TG ID:* \`${c.telegram_id}\`\n`:''}--------------------\n`;});
        resp += `Total: ${total}. Mostrando ${clients.length}.`;
        const kb_rows=[]; const nav_row = [];
        if(page>1) nav_row.push({text:`⬅️ P ${page-1}`,callback_data:`listclients_page_${page-1}_${statusStr}_${term||''}`});
        if(page<Math.ceil(total/limit)) nav_row.push({text:`P ${page+1} ➡️`,callback_data:`listclients_page_${page+1}_${statusStr}_${term||''}`});
        if(nav_row.length > 0) kb_rows.push(nav_row);
        kb_rows.push([{text:' Volver al Menú Clientes', callback_data:'menu_clientes'}]);

        try { await bot.editMessageText(resp, {chat_id:msg.chat.id, message_id:msg.message_id, parse_mode:'Markdown', reply_markup:{inline_keyboard:kb_rows}}); } catch(e){console.warn("Error editando paginación listclients:", e.message)}

    } catch(e){console.error('Error cb listclients:',e);}
  }

});


// Mensaje general / Comando no reconocido
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  const handledCommands = [
      '/start', '/help', '/menu',
      '/addadmin', '/listadmins', '/setadminstatus',
      '/addclient', '/listclients', '/viewclient', '/editclient', '/setclientstatus',
      '/neworder', '/listorders', '/vieworder', '/setorderstatus', '/editorder'
  ];

  // Si el comando es uno de los que ahora muestra menú, no hacer nada más aquí.
  if (text === '/start' || text === '/menu') return;

  let isHandledByOnText = handledCommands.some(cmd => text.startsWith(cmd + ' ') || text === cmd);


  if (isHandledByOnText) {
      // Este log es para depuración, para ver si onText lo tomó.
      // console.log(`Comando '${text}' potencialmente manejado por un onText específico.`);
      return;
  }

  console.log(`Mensaje (no comando o comando desconocido) de ${msg.from.username} (ID: ${msg.from.id}): ${text}`);

  if (text.startsWith('/')) {
    const userIsAdmin = await isAdmin(msg.from.id);
    if (userIsAdmin) {
        bot.sendMessage(chatId, `Comando desconocido: \`${text}\`. Usa /menu o /help.`, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, "No entiendo ese comando o no tienes permiso. Contacta a un administrador.");
    }
  }
});


// Manejo de errores del bot
bot.on('polling_error', (error) => {
  console.error(`Error de polling: ${error.code} - ${error.message ? error.message : JSON.stringify(error)}`);
  if (error.code === 'EFATAL') {
    console.error("Error fatal de polling. El bot podría necesitar reiniciarse.");
  }
});
bot.on('webhook_error', (error) => {
  console.error(`Error de webhook: ${error.code} - ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

console.log('El bot está configurado y escuchando mensajes...');
