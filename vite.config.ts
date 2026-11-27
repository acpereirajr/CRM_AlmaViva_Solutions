import { defineConfig } from 'vite';
// echarts e echarts-gl só carregam na Reunião de forecast (import dinâmico), por isso os pedaços grandes são esperados.
export default defineConfig({ server: { port: 5173 }, build: { chunkSizeWarningLimit: 1600 } });
