import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';

// Import Baileys functions
import makeWASocket, {
   useMultiFileAuthState,
   DisconnectReason,
   fetchLatestBaileysVersion,
   Browsers
} from 'baileys';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public directory
app.use(express.static('public'));
app.use(express.json());

// Serve the main page
app.get('/', (req, res) => {
   res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Endpoint to get connection status
app.get('/status', (req, res) => {
   res.json({
      connected: sock?.user ? true : false,
      user: sock?.user || null
   });
});

// Endpoint to request pairing code
app.post('/pair', async (req, res) => {
   const { phoneNumber } = req.body;
   if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
   }

   try {
      // Format phone number (E.164 without +)
      const formattedNumber = phoneNumber.replace(/[^0-9]/g, '');

      // Store the phone number to use when connection is ready
      pendingPairingNumber = formattedNumber;

      // If socket exists, try to request code immediately
      if (sock) {
         const code = await sock.requestPairingCode(formattedNumber);
         console.log('Pairing code sent:', code);
         io.emit('pairingCode', code);
         return res.json({ code });
      } else {
         // Create a new socket connection if one doesn't exist
         await connectToWhatsApp();
         // The pairing code will be requested in the connection.update event
         res.json({ message: 'Pairing code request initiated. Check your phone for the code.' });
      }
   } catch (error) {
      console.error('Error requesting pairing code:', error);
      res.status(500).json({ error: error.message });
   }
});

let sock;
let pendingPairingNumber = null;

async function connectToWhatsApp() {
   const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
   const { version } = await fetchLatestBaileysVersion();

   sock = makeWASocket({
      version,
      printQRInTerminal: false, // We'll handle QR display ourselves
      auth: state,
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: true
   });

   sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
         // Convert QR to text and emit to frontend
         qrcode.generate(qr, { small: true }, (qrcode) => {
            console.log('QR Code received, check the website');
            io.emit('qr', qrcode);
         });
      }

      // According to documentation, we should request pairing code when connection is "connecting" or QR is present
      if ((connection === "connecting" || !!qr) && pendingPairingNumber) {
         try {
            console.log("EL PHONE NUMBER 📲", pendingPairingNumber);

            const code = await sock.requestPairingCode(pendingPairingNumber);
            console.log('Pairing code sent:', code);
            io.emit('pairingCode', code);
            pendingPairingNumber = null; // Clear the pending number
         } catch (error) {
            console.error('Error requesting pairing code:', error);
         }
      }

      if (connection === 'close') {
         const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
         console.log('Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
         if (shouldReconnect) {
            connectToWhatsApp();
         }
      } else if (connection === 'open') {
         console.log('Connected to WhatsApp');
         io.emit('connected', sock.user);
      }
   });

   sock.ev.on('creds.update', async () => {
      await saveCreds();
   });

   // Handle incoming messages
   sock.ev.on('messages.upsert', async (m) => {
      // Process incoming messages if needed
      console.log('New message received:', JSON.stringify(m, undefined, 2));
   });
}

// Handle socket connections
io.on('connection', (socket) => {
   console.log('A user connected');

   // Send current connection status to new clients
   if (sock?.user) {
      socket.emit('connected', sock.user);
   }

   socket.on('disconnect', () => {
      console.log('User disconnected');
   });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
   console.log(`Server running on port ${PORT}`);
   connectToWhatsApp();
});