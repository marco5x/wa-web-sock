import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';

// Import Baileys functions
import WhatsAppSession from './WhatsAppSession.js';
import createRouter from './routes.js'; // Import the router factory

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json()); // Moved to the correct position

// Map to store active WhatsApp sessions
const sessions = new Map(); // Key: sessionId, Value: WhatsAppSession instance

// Function to delete a session
const deleteSession = (sessionId) => {
   sessions.delete(sessionId);
   const sessionPath = path.join(process.cwd(), 'auth_info_baileys', sessionId);
   if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(`Session data for ${sessionId} deleted.`);
   }
   io.emit('sessionDeleted', sessionId); // Notify clients
};

// Use the router for API endpoints first
app.use('/', createRouter(io, sessions, deleteSession));

// Then serve static files from public directory
app.use(express.static('public'));

// Serve the main page
app.get('/', (req, res) => {
   res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Handle socket connections
io.on('connection', (socket) => {
   console.log('User connected');

   socket.on('joinSession', (sessionId) => {
      socket.join(sessionId);
      console.log(`User joined session room: ${sessionId}`);

      const session = sessions.get(sessionId);
      if (session) {
         // Send current status to the newly joined client
         socket.emit('status', session.getStatus());
         if (session.qrCode) {
            socket.emit('qr', session.qrCode);
         }
         if (session.isConnected) {
            socket.emit('connected', session.user);
         }
      }
   });

   socket.on('disconnect', () => {
      console.log('User disconnected');
   });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => { // Make the callback function async
   console.log(`Server running on port ${PORT}`);
   // Initialize existing sessions on startup
   const authInfoPath = path.join(process.cwd(), 'auth_info_baileys');
   if (fs.existsSync(authInfoPath)) {
      const sessionDirs = fs.readdirSync(authInfoPath, { withFileTypes: true })
         .filter(dirent => dirent.isDirectory())
         .map(dirent => dirent.name);

      for (const sessionId of sessionDirs) {
         const session = new WhatsAppSession(sessionId, io, deleteSession); // Pass the deleteSession callback
         sessions.set(sessionId, session);
         
         await session.loadAuthState(); // Ensure auth state is loaded

         if (!session.isRegistered()) {
            console.log(`Session ${sessionId}: Not registered. Deleting session data and skipping connection.`);
            deleteSession(sessionId);
            continue; // Skip connection attempt for unregistered sessions
         }

         // Attempt to connect the session with a timeout
         Promise.race([
            session.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 30000)) // 30 seconds timeout
         ])
         .then(() => {
            console.log(`Session ${sessionId}: Reconnected successfully.`);
         })
         .catch((error) => {
            console.error(`Session ${sessionId}: Failed to reconnect or timed out:`, error.message);
            deleteSession(sessionId); // Delete the session if it fails to connect or times out
         });
         console.log(`Attempting to reconnect session: ${sessionId}`);
      }
   }
});
