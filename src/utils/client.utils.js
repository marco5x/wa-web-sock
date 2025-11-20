import {
  downloadMediaMessage,
  getContentType
} from 'baileys';
function bufferToBase64(buffer) {
  return buffer.toString('base64');
}
/**
 * @description Añade el número de WhatsApp de la madre en la base de datos
 * @param {string} id - ID del cliente
 * @param {string} number - Número de WhatsApp
 * @return {Promise<void>} - Promesa que se resuelve cuando se completa la inclusión
 * @throws {Error} Si ocurre un error al añadir el número
 */
export async function sendDbClientWhatsappBaileys(id, number, organization_id, funnel_id) {
  await fetch(`${process.env.URL_DB}/add_whatsapp_web/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: id,
      phone: number,
      status: "SYNCHRONIZED",
      organization_id: organization_id,
      funnel_id: funnel_id,
    }),
  });
}

export async function sendMessageToDatabase(m, sock) {
  console.log("MJE 👉", m);
  
    const msjeObject = m.messages[0]
    const msje = msjeObject.message
    const message_type = getContentType(msje)
    let finallyJid;
    let body;
    
    const posibledLid = m?.messages[0]?.key?.remoteJidAlt
    
    if(posibledLid.includes("lid")) {
        finallyJid = m?.messages[0]?.key?.remoteJid
        body = msje?.extendedTextMessage?.text
    } else {
        finallyJid = msjeObject?.key?.remoteJidAlt
        body = msje?.conversation
    }

    const from = finallyJid.split("@")[0] + "@c.us"
    
    const payload = {
      ...m,
      _data: {
        from,
        body,
        to: sock?.authState?.creds.me?.id.split(":")[0] + "@c.us",
        notifyName: msjeObject.pushName,
        type: "chat"
      },
      from,
      to: sock?.authState?.creds.me?.id.split(":")[0] + "@c.us",
      notifyName: msjeObject.pushName,
      body,
      type: "chat"
    }

    payload._data.hasMedia = false
    // Para imágenes
    if (message_type === 'imageMessage') {
        const buffer = await downloadMediaMessage(msjeObject, 'buffer', {}, {
            reuploadRequest: sock.updateMediaMessage
        })
        payload._data.body = bufferToBase64(buffer)
        payload._data.hasMedia = true
        payload.type = "image"
    }
    // Para documentos y stickers
    if (message_type === 'documentMessage' || message_type === "stickerMessage") {
        const buffer = await downloadMediaMessage(msjeObject, 'buffer', {})
        payload._data.body = bufferToBase64(buffer)
        payload._data.hasMedia = true
        payload.type = message_type === "documentMessage" ? "document" : "sticker"
    }
    if (message_type === 'audioMessage') {
        const buffer = await downloadMediaMessage(
            m,
            'buffer',
            {},
            { reuploadRequest: sock.updateMediaMessage }
        )
        // Verificar si es PTT (nota de voz)
        const isPTT = m.message.audioMessage?.ptt
          payload._data.body = bufferToBase64(buffer)
          payload._data.hasMedia = true
          payload.type = isPTT ? "ptt" : "audio"
    }
  try {
    const response = await fetch(`${process.env.URL_DB_WH}/whatsapp_web/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(
        `Error al enviar mensaje: ${response.status} ${response.statusText}`
      );
    } else {
      console.log(
        `Mensaje de ${payload._data.from || ""} enviado correctamente :marca_de_verificación_blanca:`
      );
    }
  } catch (error) {
    console.error("Error al enviar el mensaje al backend:", error);
  }
}

export async function deleteClientDb(id, organization_id) {
        try {
            const resp = await fetch(`${process.env.URL_DB}/delete_whatsapp_web/${id}/`,
            { method: 'DELETE',
              headers: {
                "Content-Type": "application/json",
                },
              body: JSON.stringify({ organization_id })
             });
            const data = await resp.json();
            if (data.success) {
                console.log(`User 👤 ${id} deleted ❌`);
                return data
            }
        } catch (err) {
            console.error('Error al eliminar cliente:', err);
        }
    };
