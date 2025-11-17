import makeWASocket, {
   useMultiFileAuthState,
   DisconnectReason,
   fetchLatestBaileysVersion,
   Browsers
} from 'baileys';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';

class WhatsAppSession {
   constructor(sessionId, io, onSessionDeleted) {
      this.sessionId = sessionId;
      this.io = io;
      this.onSessionDeleted = onSessionDeleted;
      this.sock = null;
      this.pendingPairingNumber = null;
      this.isConnected = false;
      this.user = null;
      this.qrCode = null;
      this.sessionPath = path.join('auth_info_baileys', this.sessionId);

      // Load auth state immediately in the constructor
      this.loadAuthState();
   }

   async loadAuthState() {
      if (!fs.existsSync(this.sessionPath)) {
         fs.mkdirSync(this.sessionPath, { recursive: true });
      }
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
      this.authState = state;
      this.saveCreds = saveCreds;
   }

   isRegistered() {
      return this.authState?.creds?.registered;
   }

   async connect() {
      return new Promise(async (resolve, reject) => {
         if (this.sock) {
            // If already connected or connecting, resolve immediately
            if (this.isConnected || (this.sock.ws.readyState === this.sock.ws.OPEN || this.sock.ws.readyState === this.sock.ws.CONNECTING)) {
               return resolve(this.sock);
            }
         }

         // Ensure auth state is loaded before making socket
         if (!this.authState) {
            await this.loadAuthState();
         }

         const { version } = await fetchLatestBaileysVersion();

         this.sock = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: this.authState,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: true
         });

         this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
               if (this.authState.creds.registered) {
                  // If QR is received for a registered session, it means credentials are no longer valid.
                  // Delete the session and do not emit QR.
                  console.log(`Session ${this.sessionId}: Registered session received QR. Deleting session data.`);
                  if (fs.existsSync(this.sessionPath)) {
                     fs.rmSync(this.sessionPath, { recursive: true, force: true });
                  }
                  if (this.onSessionDeleted) {
                     this.onSessionDeleted(this.sessionId);
                  }
                  reject(new Error('Registered session received QR, logged out.')); // Reject the promise
               } else if (!this.pendingPairingNumber) {
                  // Only generate QR if it's a new session and no pairing code is pending
                  qrcode.generate(qr, { small: true }, (qrcodeText) => {
                     console.log(`Session ${this.sessionId}: QR Code received, check the website`);
                     this.qrCode = qrcodeText;
                     this.io.to(this.sessionId).emit('qr', qrcodeText);
                  });
               }
            }

            // Handle pairing code request if pending and no QR is present
            if (connection === "connecting" && !qr && this.pendingPairingNumber && this.sock?.ws?.readyState === this.sock.ws.OPEN) {
               try {
                  console.log(`Session ${this.sessionId}: Requesting pairing code for ${this.pendingPairingNumber}`);
                  const code = await this.sock.requestPairingCode(this.pendingPairingNumber);
                  console.log(`Session ${this.sessionId}: Pairing code sent:`, code);
                  this.io.to(this.sessionId).emit('pairingCode', code);
                  this.pendingPairingNumber = null; // Clear the pending number
               } catch (error) {
                  console.error(`Session ${this.sessionId}: Error requesting pairing code:`, error);
                  this.io.to(this.sessionId).emit('pairingCodeError', { error: error.message });
               }
            }

            if (connection === 'close') {
               const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
               console.log(`Session ${this.sessionId}: Connection closed due to`, lastDisconnect?.error, ', reconnecting:', shouldReconnect);
               this.isConnected = false;
               this.user = null;
               this.qrCode = null;
               this.io.to(this.sessionId).emit('disconnected');
               if (shouldReconnect) {
                  this.connect().then(resolve).catch(reject); // Reconnect and propagate promise
               } else {
                  // Logged out, delete session data
                  console.log(`Session ${this.sessionId}: Logged out. Deleting session data.`);
                  if (fs.existsSync(this.sessionPath)) {
                     fs.rmSync(this.sessionPath, { recursive: true, force: true });
                  }
                  if (this.onSessionDeleted) {
                     this.onSessionDeleted(this.sessionId);
                  }
                  reject(new Error('Logged out')); // Reject if logged out
               }
            } else if (connection === 'open') {
               console.log(`Session ${this.sessionId}: Connected to WhatsApp`);
               this.isConnected = true;
               this.user = this.sock.user;
               this.qrCode = null; // Clear QR once connected
               this.io.to(this.sessionId).emit('connected', this.sock.user);
               resolve(this.sock); // Resolve when connected
            }
         });

         this.sock.ev.on('creds.update', async () => {
            await this.saveCreds();
         });

         this.sock.ev.on('messages.upsert', async (m) => {
            console.log(`Session ${this.sessionId}: New message received:`, JSON.stringify(m, undefined, 2));
            this.io.to(this.sessionId).emit('message', m);
         });
      });
   }

   async requestPairingCode(phoneNumber) {
      this.pendingPairingNumber = phoneNumber.replace(/[^0-9]/g, '');
      // If not connected, connect will handle the pairing code request via connection.update event
      if (!this.sock || this.sock.ws.readyState !== this.sock.ws.OPEN) {
         await this.connect();
      }
      // The pairing code will be requested in the connection.update event
      return null;
   }

   getStatus() {
      return {
         sessionId: this.sessionId,
         connected: this.isConnected,
         user: this.user,
         qrCode: this.qrCode // Include QR code in status for new connections
      };
   }
}

export default WhatsAppSession;
