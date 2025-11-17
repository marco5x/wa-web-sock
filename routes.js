import express from 'express';
import WhatsAppSession from './WhatsAppSession.js';
import fs from 'fs';
import path from 'path';

const createRouter = (io, sessions, deleteSession) => {
   const router = express.Router();

   // Endpoint to get connection status for a specific session or all sessions
   router.get('/status', (req, res) => {
      const { sessionId } = req.query;

      if (sessionId) {
         const session = sessions.get(sessionId);
         if (session) {
            return res.json(session.getStatus());
         }
         return res.status(404).json({ error: 'Session not found' });
      }

      // Return status for all sessions
      const allSessionsStatus = Array.from(sessions.values()).map(session => session.getStatus());
      res.json(allSessionsStatus);
   });

   // Endpoint to delete a specific session
   router.delete('/session/:sessionId', (req, res) => {
      const { sessionId } = req.params;
      if (sessions.has(sessionId)) {
         deleteSession(sessionId);
         return res.json({ message: `Session ${sessionId} deleted successfully.` });
      }
      res.status(404).json({ error: 'Session not found' });
   });

   // Endpoint to request a pairing code for a session
   router.post('/pair', async (req, res) => {
      const { sessionId, phoneNumber } = req.body;

      if (!sessionId) {
         return res.status(400).json({ error: 'Session ID is required' });
      }
      if (!phoneNumber) {
         return res.status(400).json({ error: 'Phone number is required for pairing code' });
      }

      let session = sessions.get(sessionId);
      if (!session) {
         session = new WhatsAppSession(sessionId, io, deleteSession);
         sessions.set(sessionId, session);
         console.log(`New session created: ${sessionId}`);
      }

      try {
         const code = await session.requestPairingCode(phoneNumber);
         return res.json({ message: 'Pairing code request initiated. Check your phone for the code.', code });
      } catch (error) {
         console.error(`Error in /pair for session ${sessionId}:`, error);
         res.status(500).json({ error: error.message });
      }
   });

   // Endpoint to request a QR code for a new session
   router.post('/qr', async (req, res) => {
      console.log(`[QR Route] Received request for /qr. Body:`, req.body);
      const { sessionId } = req.body;

      if (!sessionId) {
         console.log(`[QR Route] Error: Session ID is required.`);
         return res.status(400).json({ error: 'Session ID is required' });
      }

      let session = sessions.get(sessionId);
      if (!session) {
         session = new WhatsAppSession(sessionId, io, deleteSession);
         sessions.set(sessionId, session);
         console.log(`[QR Route] New session created: ${sessionId}`);
      }

      try {
         console.log(`[QR Route] Attempting to connect session ${sessionId} for QR.`);
         await session.connect(); // Initiate connection for QR code
         console.log(`[QR Route] Session ${sessionId} connected for QR. Sending JSON response.`);
         return res.json({ message: 'QR code request initiated. Check the website for the QR.' });
      } catch (error) {
         console.error(`[QR Route] Error in /qr for session ${sessionId}:`, error);
         res.status(500).json({ error: error.message });
      }
   });

   return router;
};

export default createRouter;
