import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		// Dev only: forward /api to the API so the browser sees one origin, as in production.
		// 127.0.0.1, not localhost: the API listens on IPv4 and localhost may resolve to ::1 first.
		proxy: { "/api": "http://127.0.0.1:3000" },
	},
});
