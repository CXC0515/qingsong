import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeConfig} from 'vite';
import rootConfig from '../../../vite.config';
const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,'../../..');
export default mergeConfig(rootConfig({command:'serve',mode:'development'}),{
 root,
 resolve:{alias:[{find:/^\.\.\/assistant\/AssistantPanel$/,replacement:path.join(directory,'OfficialAssistantPanel.tsx')}]},
 server:{host:'127.0.0.1',port:4480,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:4481',ws:true},'/official':{target:'http://127.0.0.1:4481',ws:true}}},
 plugins:[{name:'isolated-prototype-login',transformIndexHtml(html:string){return html.replace('<title>青松教师</title>','<title>青松教师 · 官方助手原型</title>').replace('<script type="module" src="/src/main.tsx"></script>',`<script type="module">await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'official-preview@example.test',password:'Prototype-only-123456'})});await import('/src/main.tsx');</script>`);}}],
});
