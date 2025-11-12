import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Prevent bundling of dev-only module used in Electron main process.
      // It is only required in development (when !app.isPackaged) and should
      // not be resolved during production build.
      external: ['electron-devtools-installer'],
    },
  },
});
