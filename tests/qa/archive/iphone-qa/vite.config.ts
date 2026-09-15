import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
const app = fileURLToPath(new URL('../../../../src/', import.meta.url));
export default defineConfig({
 base: './', cacheDir: './.vite-cache', publicDir: false,
 plugins: [{name:'isolated-qa-cloud-key',enforce:'pre',transform(code,id){
  if(id.split('?')[0]!==`${app}lib/game/cloud-save.ts`)return;
  const before='export const CLOUD_SAVE_KEY = "community-seasons-save-v1";';
  if(!code.includes(before))throw new Error('QA cloud key isolation needs review: production key declaration changed.');
  return code.replace(before,'export const CLOUD_SAVE_KEY = "qa-iphone-20260910-community-seasons-save-v1";');
 },generateBundle(){
  // Keep old experimental font/DPR helpers out of the new phone build.
  for(const fileName of ['probe.js','qa-suite.js'])
   this.emitFile({type:'asset',fileName,source:readFileSync(new URL(`./public/${fileName}`,import.meta.url),'utf8')});
  this.emitFile({type:'asset',fileName:'favicon.svg',source:readFileSync(`${app}public/favicon.svg`)});
 }},react()],
 resolve:{dedupe:["react","react-dom"],alias:[
  {find:/^@\/lib\/game\/engine$/,replacement:fileURLToPath(new URL('./engine-qa.ts',import.meta.url))},
  {find:/^@\/lib\/game\/render$/,replacement:fileURLToPath(new URL('./render-qa.ts',import.meta.url))},
  {find:/^@\/lib\/game\/toy-sdk$/,replacement:fileURLToPath(new URL('./toy-sdk-qa.ts',import.meta.url))},
  {find:'@',replacement:app},
 ]},
 css:{postcss:{plugins:[tailwindcss({base:app})]}},
 build:{outDir:'dist-20260910',emptyOutDir:true,target:'es2022'},
});
