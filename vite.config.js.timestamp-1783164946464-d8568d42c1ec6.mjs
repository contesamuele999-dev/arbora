// vite.config.js
import { defineConfig } from "file:///sessions/admiring-sweet-einstein/mnt/Arbora%20App/arbora/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/admiring-sweet-einstein/mnt/Arbora%20App/arbora/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///sessions/admiring-sweet-einstein/mnt/Arbora%20App/arbora/node_modules/vite-plugin-pwa/dist/index.js";
var base = process.env.VITE_BASE || "/arbora/";
var vite_config_default = defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Arbora",
        short_name: "Arbora",
        description: "Note ad albero per imprenditori: Vite, Visioni, Viste.",
        theme_color: "#1f7a4d",
        background_color: "#0f1411",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: base + "index.html"
      }
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvYWRtaXJpbmctc3dlZXQtZWluc3RlaW4vbW50L0FyYm9yYSBBcHAvYXJib3JhXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvc2Vzc2lvbnMvYWRtaXJpbmctc3dlZXQtZWluc3RlaW4vbW50L0FyYm9yYSBBcHAvYXJib3JhL3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9zZXNzaW9ucy9hZG1pcmluZy1zd2VldC1laW5zdGVpbi9tbnQvQXJib3JhJTIwQXBwL2FyYm9yYS92aXRlLmNvbmZpZy5qc1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnXG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJ1xuXG4vLyBJTVBPUlRBTlRFIHBlciBHaXRIdWIgUGFnZXM6XG4vLyBzZSBwdWJibGljaGkgc3UgaHR0cHM6Ly88dXRlbnRlPi5naXRodWIuaW8vYXJib3JhLyBsYXNjaWEgYmFzZSA9ICcvYXJib3JhLydcbi8vIHNlIHVzaSB1biBkb21pbmlvIGN1c3RvbSBvIHVuIHJlcG8gXCJ1c2VyLmdpdGh1Yi5pb1wiLCBtZXR0aSBiYXNlID0gJy8nXG5jb25zdCBiYXNlID0gcHJvY2Vzcy5lbnYuVklURV9CQVNFIHx8ICcvYXJib3JhLydcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgYmFzZSxcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgVml0ZVBXQSh7XG4gICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcbiAgICAgIGluY2x1ZGVBc3NldHM6IFsnZmF2aWNvbi5zdmcnLCAnaWNvbi0xOTIucG5nJywgJ2ljb24tNTEyLnBuZyddLFxuICAgICAgbWFuaWZlc3Q6IHtcbiAgICAgICAgbmFtZTogJ0FyYm9yYScsXG4gICAgICAgIHNob3J0X25hbWU6ICdBcmJvcmEnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ05vdGUgYWQgYWxiZXJvIHBlciBpbXByZW5kaXRvcmk6IFZpdGUsIFZpc2lvbmksIFZpc3RlLicsXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnIzFmN2E0ZCcsXG4gICAgICAgIGJhY2tncm91bmRfY29sb3I6ICcjMGYxNDExJyxcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxuICAgICAgICBzdGFydF91cmw6IGJhc2UsXG4gICAgICAgIHNjb3BlOiBiYXNlLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiAnaWNvbi0xOTIucG5nJywgc2l6ZXM6ICcxOTJ4MTkyJywgdHlwZTogJ2ltYWdlL3BuZycgfSxcbiAgICAgICAgICB7IHNyYzogJ2ljb24tNTEyLnBuZycsIHNpemVzOiAnNTEyeDUxMicsIHR5cGU6ICdpbWFnZS9wbmcnIH0sXG4gICAgICAgICAgeyBzcmM6ICdpY29uLTUxMi5wbmcnLCBzaXplczogJzUxMng1MTInLCB0eXBlOiAnaW1hZ2UvcG5nJywgcHVycG9zZTogJ21hc2thYmxlJyB9XG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgICB3b3JrYm94OiB7XG4gICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyxjc3MsaHRtbCxzdmcscG5nLGljbyx3b2ZmMn0nXSxcbiAgICAgICAgbmF2aWdhdGVGYWxsYmFjazogYmFzZSArICdpbmRleC5odG1sJ1xuICAgICAgfVxuICAgIH0pXG4gIF1cbn0pXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlWLFNBQVMsb0JBQW9CO0FBQ3RYLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFLeEIsSUFBTSxPQUFPLFFBQVEsSUFBSSxhQUFhO0FBRXRDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixRQUFRO0FBQUEsTUFDTixjQUFjO0FBQUEsTUFDZCxlQUFlLENBQUMsZUFBZSxnQkFBZ0IsY0FBYztBQUFBLE1BQzdELFVBQVU7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLGFBQWE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLGtCQUFrQjtBQUFBLFFBQ2xCLFNBQVM7QUFBQSxRQUNULFdBQVc7QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxVQUNMLEVBQUUsS0FBSyxnQkFBZ0IsT0FBTyxXQUFXLE1BQU0sWUFBWTtBQUFBLFVBQzNELEVBQUUsS0FBSyxnQkFBZ0IsT0FBTyxXQUFXLE1BQU0sWUFBWTtBQUFBLFVBQzNELEVBQUUsS0FBSyxnQkFBZ0IsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLFdBQVc7QUFBQSxRQUNsRjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNQLGNBQWMsQ0FBQyxzQ0FBc0M7QUFBQSxRQUNyRCxrQkFBa0IsT0FBTztBQUFBLE1BQzNCO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
