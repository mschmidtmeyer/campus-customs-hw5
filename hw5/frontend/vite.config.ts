import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend (HW 5/backend/main.py) allows this origin: http://localhost:5173
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
