import { defineConfig } from 'vite';

// Le serveur (auth + websocket) tourne sur le port 3001.
// Vite proxifie /api et /ws vers lui : ainsi le client n'a qu'une seule origine,
// ce qui est indispensable pour les Discord Activities (tout passe par /.proxy).
export default defineConfig({
  envDir: '..', // lit le .env a la racine du repo
  server: {
    port: 5173,
    // Discord sert l'Activity derriere *.discordsays.com : on l'autorise.
    allowedHosts: ['.discordsays.com'],
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: {
    target: 'esnext',
  },
});
