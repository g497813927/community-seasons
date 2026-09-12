import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
const app=fileURLToPath(new URL('../../outputs/community-seasons/',import.meta.url));
export default defineConfig({
 base:'./',cacheDir:'./.vite-cache',publicDir:'public',plugins:[react()],
 resolve:{dedupe:["react","react-dom"],alias:[
  {find:/^@\/lib\/game\/engine$/,replacement:fileURLToPath(new URL('./engine-qa.ts',import.meta.url))},
  {find:/^@\/lib\/game\/render$/,replacement:fileURLToPath(new URL('./render-qa.ts',import.meta.url))},
  {find:/^@\/lib\/game\/toy-sdk$/,replacement:fileURLToPath(new URL('./toy-sdk-qa.ts',import.meta.url))},
  {find:'@',replacement:app},
 ]},css:{postcss:{plugins:[tailwindcss({base:app})]}},
 build:{outDir:'dist',emptyOutDir:true,target:'es2022'},
});
