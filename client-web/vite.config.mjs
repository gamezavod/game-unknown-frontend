import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const { GAME_API_TARGET } = loadEnv(mode, process.cwd(), "GAME_API_");
  const proxy = {
    "/game": { target: GAME_API_TARGET || "http://127.0.0.1:8000", changeOrigin: true },
  };
  return { server: { proxy }, preview: { proxy } };
});
