import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // allow access from outside (ngrok, LAN)
    port: 5180,          // your chosen port
    allowedHosts: true,  // allow ANY host (good for dev, fixes ngrok error)

    proxy: {
      '/api': 'http://localhost:4000',
      '/priorities': 'http://localhost:4000',
      '/routes': 'http://localhost:4000',
      '/gap-analysis': 'http://localhost:4000',
      '/complaints': 'http://localhost:4000',
      '/panchayats': 'http://localhost:4000',
      '/auth': 'http://localhost:4000',
      '/admin': 'http://localhost:4000',
      '/issues': 'http://localhost:4000',
      '/budget': 'http://localhost:4000',
      '/assignments': 'http://localhost:4000',
      '/upload': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000'
    }
  }
});
