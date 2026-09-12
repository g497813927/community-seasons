import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import tailwindcss from '@tailwindcss/postcss';import {fileURLToPath,URL} from 'node:url';
const local=(p:string)=>fileURLToPath(new URL(p,import.meta.url));

export default defineConfig({plugins:[react()],resolve:{dedupe:["react","react-dom"],alias:[

{find:'@/lib/game/engine',replacement:local('./engine.ts')},{find:'@/lib/game/toy-sdk',replacement:local('./toy-sdk.ts')},{find:'@',replacement:local('../../outputs/community-seasons/')}
]},css:{postcss:{plugins:[tailwindcss({base:local('../../outputs/community-seasons/')})]}},server:{host:'127.0.0.1',port:3028,strictPort:true,fs:{allow:['../..']}}});
