import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool,neonConfig} from '@neondatabase/serverless';
test('Worker uses official Neon Pool, secure default transport and transaction-compatible API',async()=>{
 const source=await readFile(new URL('../lib/starflow-preview.ts',import.meta.url),'utf8');
 assert.match(source,/import \{ Pool as NeonPool \} from '@neondatabase\/serverless'/);
 assert.match(source,/import \{ createPreviewRegistrationMail \} from '@\/backend\/services\/preview-registration-mail.mjs'/);
 assert.match(source,/createPreviewRegistrationMail\(bindings\)/);
 assert.match(source,/createPreviewHandler\(\{env:bindings,authorizePreview,Pool:NeonPool,registrationMail\}\)/);
 assert.doesNotMatch(source,/registrationMail:\s*undefined/);
 assert.equal(neonConfig.useSecureWebSocket,true);
 assert.equal(neonConfig.poolQueryViaFetch,false);
 const pool=new Pool({host:'ep-fixture.example.neon.tech',database:'neondb',user:'synthetic',password:'fixture',max:1});
 try{assert.equal(typeof pool.connect,'function');assert.equal(typeof pool.query,'function');}finally{await pool.end();}
});

test('existing Worker preview and production configuration cannot activate the new backend by default',async()=>{
 const raw=await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8');
 // The checked-in configuration is deliberately strict JSON, not executable code.
 const cfg=JSON.parse(raw);
 assert.equal(cfg.name,'weizai');
 assert.equal(cfg.main,'.open-next/worker.js');
 assert.ok(cfg.compatibility_flags.includes('nodejs_compat'));
 const vars=cfg.previews?.vars;
 assert.ok(vars);
 assert.deepEqual(Object.keys(vars).sort(),['CLOUDINARY_CLOUD_NAME','STARFLOW_AUTH_ORIGIN','STARFLOW_PREVIEW_DB_HOST','STARFLOW_V2_ENABLED','STARFLOW_V2_PREVIEW_ONLY','STARFLOW_FRESH_PREVIEW_ENABLED','STARFLOW_REGISTRATION_PREVIEW_ENABLED','STARFLOW_BREVO_SEND_ENABLED','STARFLOW_CLOUDINARY_UPLOAD_ENABLED'].sort());
 assert.equal(vars.CLOUDINARY_CLOUD_NAME,'buaqssyk');
 for(const key of ['STARFLOW_FRESH_PREVIEW_ENABLED','STARFLOW_REGISTRATION_PREVIEW_ENABLED','STARFLOW_BREVO_SEND_ENABLED','STARFLOW_CLOUDINARY_UPLOAD_ENABLED'])assert.equal(vars[key],'false');
 assert.equal(vars.STARFLOW_V2_ENABLED,'false');
 assert.equal(vars.STARFLOW_V2_PREVIEW_ONLY,'true');
 assert.equal(vars.STARFLOW_AUTH_ORIGIN,'https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev');
 assert.equal(vars.STARFLOW_PREVIEW_DB_HOST,'ep-plain-snow-b3x6hb9a.c-4.ap-southeast-1.aws.neon.tech');
 for(const key of Object.keys(cfg.vars??{}))assert.ok(!/^(STARFLOW_|BETTER_AUTH_SECRET$)/.test(key),'unexpected production preview binding');
 for(const key of Object.keys(cfg.env??{}))assert.ok(!Object.keys(cfg.env[key]?.vars??{}).some(v=>/^(STARFLOW_|BETTER_AUTH_SECRET$)/.test(v)),'unexpected environment preview binding');
});
