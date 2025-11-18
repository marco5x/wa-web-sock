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

    const msjeObject = m.messages[0]

    const msje = msjeObject.message

    // console.log(msjeObject, 'el msje object')

    // console.log(downloadMediaMessage)

    // console.log(getContentType)

    const message_type = getContentType(msje)

    // console.log(message_type, 'el type')

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


    const from = finallyJid.split("@")[0]
    const payload = {
            ...m,
            _data: {
              from,
              body
            }
          }

    // console.log("payload -> ", payload)
    payload._data.hasMedia = false

    // Para imágenes  
    if (message_type === 'imageMessage') {  
        const buffer = await downloadMediaMessage(msjeObject, 'buffer', {}, {   
            reuploadRequest: sock.updateMediaMessage  
        })

        // console.log("EL BUFFER =====> ", buffer)
        // usar buffer...  
        payload._data.body = bufferToBase64(buffer)
        payload._data.hasMedia = true
    }

    // Para documentos y stickers
    if (message_type === 'documentMessage' || message_type === "stickerMessage") {  
        const buffer = await downloadMediaMessage(msjeObject, 'buffer', {})  
        // usar buffer...
        payload._data.body = bufferToBase64(buffer)
        payload._data.hasMedia = true
    }
    

    
    
    // console.log("el payload 📢", payload)

  // 🚀 5️⃣ Enviar al backend (estructura intacta)
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
        `Mensaje de ${payload._data.from || ""} enviado correctamente ✅`
      );
    }
  } catch (error) {
    console.error("Error al enviar el mensaje al backend:", error);
  }
}

