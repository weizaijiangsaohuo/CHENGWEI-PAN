import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool,neonConfig} from '@neondatabase/serverless';
test('Worker uses official Neon Pool, secure default transport and transaction-compatible API',async()=>{
 const source=await readFile(new URL('../lib/starflow-preview.ts',import.meta.url),'utf8');
 assert.match(source,/import \{ Pool as NeonPool \} from '@neondatabase\/serverless'/);
 assert.match(source,/createPreviewHandler\(\{env:bindings,authorizePreview,Pool:NeonPool\}\)/);
 assert.equal(neonConfig.useSecureWebSocket,true);
 assert.equal(neonConfig.poolQueryViaFetch,false);
 const pool=new Pool({host:'ep-fixture.example.neon.tech',database:'neondb',user:'synthetic',password:'fixture',max:1});
 try{assert.equal(typeof pool.connect,'function');assert.equal(typeof pool.query,'function');}finally{await pool.end();}
});
