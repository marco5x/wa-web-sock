export const sendMessage = async (req, res) => {
  const clientId = req.params.clientId;
  const {
    number,
    type,
    audio,
    image,
    document,
    caption,
    message,
    body,
    buttons,
    header,
    footer,
    ptt,
    files,
    sticker,
  } = req.body;

  if (!number)
    return res
      .status(400)
      .json({ success: false, error: "Faltan datos: number" });

  const instance = clients[clientId];
  if (!instance || !instance.ready) {
    return res
      .status(404)
      .json({ success: false, message: "Cliente no disponible o no listo" });
  }

  try {
    const client = instance.client;
    let resolvedJid = `${number}@c.us`; // por defecto, asumimos número normal

    // --- Resolución LID → JID (de develop) ---
    try {
      const possibleLid = `${number}@lid`;

      // Intentar obtener contacto a partir del posible LID
      const contact = await client.getContactById(possibleLid);
      if (contact && contact.id && contact.id._serialized.endsWith("@c.us")) {
        resolvedJid = contact.id._serialized;
      } else {
        // Intentar obtener chat, en caso de que el contacto no esté disponible
        const chat = await client.getChatById(possibleLid);
        if (
          chat &&
          chat.contact &&
          chat.contact.id._serialized.endsWith("@c.us")
        ) {
          resolvedJid = chat.contact.id._serialized;
        }
      }
    } catch (e) {
      console.warn(
        `⚠️ Error intentando resolver posible LID (${number}) Asumimos que es JID:`,
        e.message
      );
      // No rompe: mantiene el número @c.us por defecto
    };

    if (Array.isArray(files) && files.length > 0) {
      const slice = files.slice(0, 6);
      const results = [];

      for (const item of slice) {
        try {
          if (!item || !item.type || !item.link) {
            results.push({
              success: false,
              error: "Item inválido: {type, link} requeridos",
            });
            continue;
          }

          if (item.type === "image") {
            const { base64, mimetype, filename } =
              await fetchImageAsBase64FromUrl(
                item.link,
                item.mimetype || "image/jpeg"
              );
            const media = new MessageMedia(mimetype, base64, filename);
            const opts = {};
            if (item.caption) opts.caption = item.caption;
            const sent = await client.sendMessage(resolvedJid, media, opts);
            results.push({
              success: true,
              type: "image",
              to: resolvedJid,
              messageId: sent?.id?._serialized ?? null,
              mimetype,
              filename,
            });
          } else if (item.type === "document") {
            const { base64, mimetype, filename } =
              await fetchPdfAsBase64FromUrl(
                item.link,
                item.mimetype || "application/pdf"
              );
            const media = new MessageMedia(mimetype, base64, filename);
            const opts = { sendMediaAsDocument: true };
            if (item.caption) opts.caption = item.caption;
            const sent = await client.sendMessage(resolvedJid, media, opts);
            results.push({
              success: true,
              type: "document",
              to: resolvedJid,
              messageId: sent?.id?._serialized ?? null,
              mimetype,
              filename,
            });
          } else {
            results.push({
              success: false,
              error: `type no soportado: ${item.type}`,
            });
          }
        } catch (err) {
          results.push({ success: false, error: err.message });
        }
      }

      return res.status(200).json({
        success: true,
        mode: "batch",
        to: resolvedJid,
        results,
      });
    }

    if (type === "audio") {
      if (!audio || typeof audio.link !== "string" || !audio.link) {
        return res.status(400).json({
          success: false,
          error: "Missing audio.link (URL presignada de S3/Django)",
        });
      }

      const { base64, mimetype, filename } = await fetchAudioAsBase64FromUrl(
        audio.link,
        audio.mimetype || "audio/mpeg"
      );

      const media = new MessageMedia(mimetype, base64, filename);
      const options = {
        ptt: ptt === true,
        sendMediaAsDocument: false,
      };
      if (caption) options.caption = caption;

      const sent = await client.sendMessage(resolvedJid, media, options);
      return res.status(200).json({
        success: true,
        type: "audio",
        to: resolvedJid,
        clientId,
        messageId: sent?.id?._serialized ?? null,
        mimetype,
        isPTT: ptt === true,
        timestamp: new Date().toISOString(),
      });
    }

    if (type === "image") {
      if (!image || typeof image.link !== "string" || !image.link) {
        return res.status(400).json({
          success: false,
          error: "Missing image.link (URL presignada de S3/Django)",
        });
      }

      const { base64, mimetype, filename } = await fetchImageAsBase64FromUrl(
        image.link,
        image.mimetype || "image/jpeg"
      );

      const media = new MessageMedia(mimetype, base64, filename);
      const options = {};
      if (caption) options.caption = caption;

      const sent = await client.sendMessage(resolvedJid, media, options);
      return res.status(200).json({
        success: true,
        type: "image",
        to: resolvedJid,
        clientId,
        messageId: sent?.id?._serialized ?? null,
        mimetype,
        filename,
        timestamp: new Date().toISOString(),
      });
    }

    if (type === "document") {
      if (!document || typeof document.link !== "string" || !document.link) {
        return res.status(400).json({
          success: false,
          error: "Missing document.link (URL presignada de S3/Django)",
        });
      }

      const { base64, mimetype, filename } = await fetchPdfAsBase64FromUrl(
        document.link,
        document.mimetype || "application/pdf"
      );

      const media = new MessageMedia(mimetype, base64, filename);
      const options = { sendMediaAsDocument: true };
      if (caption) options.caption = caption;

      const sent = await client.sendMessage(resolvedJid, media, options);
      return res.status(200).json({
        success: true,
        type: "document",
        to: resolvedJid,
        clientId,
        messageId: sent?.id?._serialized ?? null,
        mimetype,
        filename,
        timestamp: new Date().toISOString(),
      });
    }

    if (type === "sticker") {
      if (!sticker || typeof sticker.link !== "string" || !sticker.link) {
        return res.status(400).json({
          success: false,
          error: "Missing sticker.link (URL presignada de S3/Django)",
        });
      }

      const { base64, mimetype, filename } = await fetchStickerAsBase64FromUrl(
        sticker.link,
        sticker.mimetype || "image/webp"
      );

      const media = new MessageMedia(mimetype, base64, filename);
      const options = { sendMediaAsSticker: true };
      if (caption) options.caption = caption;

      const sent = await client.sendMessage(resolvedJid, media, options);
      return res.status(200).json({
        success: true,
        type: "sticker",
        to: resolvedJid,
        clientId,
        messageId: sent?.id?._serialized ?? null,
        mimetype,
        filename,
        timestamp: new Date().toISOString(),
      });
    }

    let sentMessage;
    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
      let buttonText = "";
      if (header) buttonText += `${header}\n\n`;
      if (body) buttonText += `${body}\n\n`;
      buttons.slice(0, 3).forEach((b, idx) => {
        const id = b.index || (idx + 1).toString();
        const label = `${b.text}` || b.body;
        buttonText += `*${id}* - ${label}\n`;
      });
      if (footer) buttonText += `\n${footer}`;
      sentMessage = await client.sendMessage(resolvedJid, buttonText);
    } else {
      sentMessage = await client.sendMessage(
        resolvedJid,
        message || "Mensaje vacío"
      );
    }

    const messageData = {
      from: sentMessage._data.from.user,
      to: sentMessage._data.to.user,
      text: sentMessage._data.body,
    };

    return res.status(200).json({ success: true, data: messageData });
  } catch (err) {
    console.error("Error enviando mensaje:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};