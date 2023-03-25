import path from 'path'
import {defineConfig} from 'vite'
import eslint from 'vite-plugin-eslint'

export default defineConfig({
  plugins: [eslint()],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'lib/main.ts'),
      name: 'paravel',
      fileName: (format) => `paravel.${format}.js`
    }
  }
})
