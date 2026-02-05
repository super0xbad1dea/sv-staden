/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
    theme: {
      extend: {
        colors: {
          'primary': {
            DEFAULT: '#1e40af',
            50: '#eff6ff',
            100: '#dbeafe',
            200: '#bfdbfe',
            300: '#93c5fd',
            400: '#60a5fa',
            500: '#1e40af',
            600: '#1e3a8a',
            700: '#1e3a8a',
            800: '#172554',
            900: '#0f172a',
          },
          'accent': {
            DEFAULT: '#facc15',
            50: '#fefce8',
            100: '#fef9c3',
            200: '#fef08a',
            300: '#fde047',
            400: '#facc15',
            500: '#eab308',
            600: '#ca8a04',
            700: '#a16207',
          },
          'dark': {
            DEFAULT: '#0a0a0a',
            50: '#171717',
            100: '#1a1a1a',
            200: '#1f1f1f',
            300: '#262626',
            400: '#333333',
          },
        },
      },
    },
    plugins: [],
  }