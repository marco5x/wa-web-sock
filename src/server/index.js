import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { deleteClientDb } from '../utils/client.utils.js';

export function createServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  app.use(express.static('public'));
  app.use(express.json());

  app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });

  function attachBaileys(manager) {
    if (!manager) throw new Error('attachBaileys requires a baileys manager instance');

    // Create a new session and start its connection. Expects { sessionId }
    app.post('/session', async (req, res) => {
      const { sessionId, organization_id, funnel_id } = req.body;
      console.log("DSDE HTML 👌",{ sessionId, organization_id, funnel_id } );
      
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      try {
        //const sessionWithSesion = `${sessionId}-${organization_id}`
        await manager.createSession(sessionId, organization_id, funnel_id);
        return res.json({ message: 'Session created', sessionId });
      } catch (err) {
        console.error('Error creating session:', err?.message || err);
        return res.status(500).json({ error: err?.message || String(err) });
      }
    });

    // Get status for a session: /status?sessionId=abc
    app.get('/status', (req, res) => {
      const sessionId = req.query.sessionId;
      if (!sessionId) return res.status(400).json({ error: 'sessionId query is required' });
      const api = manager.getSession(sessionId);
      return res.json({ connected: !!api?.getUser(), user: api?.getUser() || null });
    });

    // List all sessions with status
    app.get('/sessions', (req, res) => {
      try {
        const ids = manager.listSessions();
        const sessions = ids.map((id) => {
          const api = manager.getSession(id);
          return { sessionId: id, connected: !!api?.getUser(), user: api?.getUser() || null };
        });
        return res.json(sessions);
      } catch (err) {
        console.error('Error listing sessions:', err?.message || err);
        return res.status(500).json({ error: err?.message || String(err) });
      }
    });

    // Delete / disconnect session
    app.delete('/session/:sessionId', async (req, res) => {
      const sessionId = req.params.sessionId;
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      try {
        if (typeof manager.deleteSession !== 'function') {
          return res.status(500).json({ error: 'deleteSession not supported by manager' });
        }
        const organization_id = sessionId.split("-")[1];
        await manager.deleteSession(sessionId);
        await deleteClientDb(sessionId, organization_id);
        return res.json({ message: 'Session deleted', sessionId });
      } catch (err) {
        console.error('Error deleting session:', err?.message || err);
        return res.status(500).json({ error: err?.message || String(err) });
      }
    });

    // Socket connections: allow clients to join a session room
    io.on('connection', (socket) => {
      console.log('A user connected');

      socket.on('join', (sessionId, organization_id, funnel_id) => {
        if (!sessionId) return;
        socket.join(sessionId, organization_id, funnel_id);
        //console.log('Socket joined room', sessionId);
      });

      socket.on('leave', (sessionId) => {
        if (!sessionId) return;
        socket.leave(sessionId);
      });

      socket.on('disconnect', () => {
        console.log('User disconnected');
      });
    });
  }

  return { app, server, io, attachBaileys };
}
