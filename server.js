import { createServer } from './src/server/index.js';
import createBaileys from './src/baileys/index.js';

const PORT = process.env.BAILEYS_PORT || 4005;

const { app, server, io, attachBaileys } = createServer();

const baileys = createBaileys(io);
attachBaileys(baileys);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Restore sessions found on disk (auth_info_baileys/*)
  if (typeof baileys.restoreSessions === 'function') {
    baileys.restoreSessions().catch((err) => console.error('Error restoring sessions:', err));
  }
});

// Graceful shutdown: stop all sessions before exit
async function gracefulShutdown(signal) {
  //console.log('Received', signal, '— stopping sessions...');
  try {
    if (typeof baileys.stopAllSessions === 'function') {
      await baileys.stopAllSessions();
    }
  } catch (err) {
    console.error('Error during stopAllSessions:', err);
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));