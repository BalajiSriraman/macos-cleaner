import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  css: ['~/assets/css/main.css'],
  devServer: {
    port: 3000
  },
  vite: {
    plugins: [tailwindcss()]
  },
  nitro: {
    preset: 'node-server'
  },
  app: {
    head: {
      title: 'macOS Cleaner',
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1'
        },
        {
          name: 'description',
          content: 'Analyze reclaimable macOS storage and clean it from a single Nuxt application.'
        }
      ]
    }
  },
  future: {
    compatibilityVersion: 4
  },
  compatibilityDate: '2026-03-19'
})
