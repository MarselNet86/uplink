import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  preload: {
    // externalizeDeps defaults to true even without the plugin (electron-vite
    // still auto-externalizes package.json deps), which breaks the sandboxed
    // preload context: it cannot require() arbitrary node_modules, only Node
    // built-ins and Electron APIs, so npm deps (zod, via @shared/ipcError)
    // must be bundled in rather than left as bare require() calls.
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
