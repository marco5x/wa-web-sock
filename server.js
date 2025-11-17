import { createServer } from './src/server/index.js';
import createBaileys from './src/baileys/index.js';

const PORT = process.env.PORT || 3001;

const { app, server, io, attachBaileys } = createServer({ port: PORT });

const baileys = createBaileys(io);
attachBaileys(baileys);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Baileys manager available. Create sessions with POST /session { sessionId }');
});