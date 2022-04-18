import { defineConfig } from 'vite'
import swcReact from 'vite-plugin-swc-react'

export default defineConfig({
  build: {
    manifest: true
  },
  plugins: [
    swcReact({
      swcOptions: {
        jsc: {
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
            react: {
              runtime: 'classic',
            },
          },
          parser: {
            syntax: "typescript",
            tsx: true,
            decorators: true
          }
        },
      },
    }),
  ],
})