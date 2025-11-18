import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from 'baileys';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { sendDbClientWhatsappBaileys, sendMessageToDatabase } from '../utils/client.utils.js';

// Manager that can create multiple Baileys sessions, each with its own auth folder
export default function createBaileys(io) {
  const sessions = new Map(); // sessionId -> { sock, saveCreds }

  async function createSession(sessionId, organization_id, funnel_id) {
    if (!sessionId) throw new Error('sessionId is required');
    if (sessions.has(sessionId)) return sessions.get(sessionId).api;

    const authDir = `auth_info_baileys/${sessionId}`;
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: true
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrcode.generate(qr, { small: true }, (qrcodeStr) => {
          console.log(`[${sessionId}] QR Code generated`);
          // Emit to a room with the sessionId, clients should join that room
          try {
            io.to(sessionId).emit('qr', { sessionId, qr: qrcodeStr });
          } catch (e) {
            // fallback global emit
            io.emit('qr', { sessionId, qr: qrcodeStr });
          }
        });
      }

      if (connection === 'close') {
        const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = !loggedOut;
        console.log(`[${sessionId}] Connection closed, reconnecting:`, shouldReconnect, 'loggedOut:', loggedOut);
        if (!shouldReconnect) {
          // If logged out on WhatsApp side, cleanup session and remove auth folder
          try {
            await deleteSession(sessionId);
            console.log(`[${sessionId}] Session removed due to logout from device`);
          } catch (err) {
            console.error(`[${sessionId}] error removing session after logout:`, err?.message || err);
          }
          return;
        }
        if (shouldReconnect) {
          // Recreate connection for this session.
          // Remove the old session entry first to avoid creating duplicate sockets
          try {
            const old = sessions.get(sessionId);
            sessions.delete(sessionId);
            // try to close underlying websocket if available
            try {
              if (old?.sock?.ws) old.sock.ws.close();
              if (old?.sock?.socket) old.sock.socket.close?.();
            } catch (closeErr) {
              // ignore close errors
            }

            await createSession(sessionId);
          } catch (err) {
            console.error(`[${sessionId}] reconnect error:`, err?.message || err);
          }
        }
      } else if (connection === 'open') {
        console.log(`[${sessionId}] Connected to WhatsApp`);
        try {
          io.to(sessionId).emit('connected', { sessionId, user: sock.user });
          // console.log("sock ->", sock.user)
          const number = sock.user.id.split(":")[0]
          console.log('el number -> 👢', number)
          await sendDbClientWhatsappBaileys(sessionId, number, organization_id, funnel_id )
        } catch (e) {
          io.emit('connected', { sessionId, user: sock.user });
        }
      }
    });

    sock.ev.on('creds.update', async () => {
      if (saveCreds) await saveCreds();
    });

    sock.ev.on('messages.upsert', async (m) => {
      // TODO: aca vamos a enviar los mensajes al backend w_bot
      // console.log(`[${sessionId}] New message received:`, JSON.stringify(m, undefined, 2));
      // console.log('el mensaje crudo -> ', m.messages[0])
      // console.log("le pego  bien ? ->", parsedMessage)
      if(m?.messages[0]?.senderKeyDistributionMessage || !m?.messages[0]?.key?.remoteJidAlt) return
      
      await sendMessageToDatabase(m, sock)

    });

    const api = {
      getSock: () => sock,
      getUser: () => sock?.user || null,
      stop: async () => {
        try {
          await sock.logout?.();
        } catch (err) {
          // ignore
        }
      }
    };

    sessions.set(sessionId, { sock, saveCreds, api });
    return api;
  }

  async function deleteSession(sessionId) {
    if (!sessionId) throw new Error('sessionId required');
    const entry = sessions.get(sessionId);
    if (!entry) {
      // still try to remove folder if exists
      const dir = path.join(process.cwd(), 'auth_info_baileys', sessionId);
      try {
        if (fs.existsSync(dir)) {
          await fs.promises.rm(dir, { recursive: true, force: true });
        }
      } catch (err) {
        console.error('Error removing auth dir for missing session:', err?.message || err);
      }
      return;
    }

    try {
      // attempt graceful stop
      try {
        await entry.api.stop();
      } catch (stopErr) {
        // ignore
      }

      // try to close low-level sockets
      try {
        if (entry.sock?.ws) entry.sock.ws.close();
        if (entry.sock?.socket) entry.sock.socket.close?.();
      } catch (err) {
        // ignore
      }

      sessions.delete(sessionId);

      // remove auth folder
      const dir = path.join(process.cwd(), 'auth_info_baileys', sessionId);
      if (fs.existsSync(dir)) {
        await fs.promises.rm(dir, { recursive: true, force: true });
      }

      // notify clients
      try {
        io.to(sessionId).emit('session:removed', { sessionId });
      } catch (e) {
        io.emit('session:removed', { sessionId });
      }
    } catch (err) {
      console.error(`[${sessionId}] error deleting session:`, err?.message || err);
      throw err;
    }
  }

  async function stopSession(sessionId) {
    if (!sessionId) throw new Error('sessionId required');
    const entry = sessions.get(sessionId);
    if (!entry) return;

    try {
      try {
        await entry.api.stop();
      } catch (err) {
        // ignore
      }

      try {
        if (entry.sock?.ws) entry.sock.ws.close();
        if (entry.sock?.socket) entry.sock.socket.close?.();
      } catch (err) {
        // ignore
      }

      sessions.delete(sessionId);

      try {
        io.to(sessionId).emit('session:stopped', { sessionId });
      } catch (e) {
        io.emit('session:stopped', { sessionId });
      }
    } catch (err) {
      console.error(`[${sessionId}] error stopping session:`, err?.message || err);
      throw err;
    }
  }

  async function stopAllSessions() {
    const ids = Array.from(sessions.keys());
    for (const id of ids) {
      try {
        await stopSession(id);
      } catch (err) {
        console.error(`Error stopping session ${id}:`, err?.message || err);
      }
    }
  }

  async function restoreSessions() {
    const base = path.join(process.cwd(), 'auth_info_baileys');
    try {
      if (!fs.existsSync(base)) return;
      const files = await fs.promises.readdir(base, { withFileTypes: true });
      for (const dirent of files) {
        if (!dirent.isDirectory()) continue;
        const sessionId = dirent.name;
        try {
          // createSession is idempotent if already present
          await createSession(sessionId);
          console.log(`[${sessionId}] restored session from disk`);
        } catch (err) {
          console.error(`Error restoring session ${sessionId}:`, err?.message || err);
        }
      }
    } catch (err) {
      console.error('Error restoring sessions:', err?.message || err);
    }
  }

  function getSession(sessionId) {
    return sessions.get(sessionId)?.api || null;
  }

  function listSessions() {
    return Array.from(sessions.keys());
  }

  return { createSession, getSession, listSessions, deleteSession, stopSession, stopAllSessions, restoreSessions };
}
