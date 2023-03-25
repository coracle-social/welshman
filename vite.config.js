import path from 'path'
import {defineConfig} from 'vite'

export default defineConfig({
  build: {
    lib: {
      name: 'paravel',
      entry: path.resolve(__dirname, 'lib/main.ts'),
      fileName: (format) => `paravel.${format}.js`
    }
  }
})
