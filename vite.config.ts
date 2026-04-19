import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.VITE_VOLTORB_FLIP_API_KEY ?? '';

  return {
    base: '/voltorb-flip/',
    plugins: [react()],
    define: {
      __VOLTORB_FLIP_API_KEY__: JSON.stringify(apiKey),
    },
  };
});
