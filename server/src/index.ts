import { networkInterfaces } from 'node:os';
import { env } from './env.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`Civic Map server running on port ${env.PORT}`);
  console.log(`  This PC:        http://localhost:${env.PORT}/health`);
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Phones on Wi-Fi: http://${a.address}:${env.PORT}`);
    }
  }
});
