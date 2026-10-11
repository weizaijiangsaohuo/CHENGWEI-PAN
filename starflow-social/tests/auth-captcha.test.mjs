import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual component handlers with mocked hooks and services.
// No browser, credentials, email delivery or live Supabase project is used.
function harness(file, modules={}, globals={}) {
  const slots=[];
  let index=0;
  const pending=[];
  const react={
    useState(initial){
      const position=index++;
      if(!(position in slots))slots[position]=initial;
      return [slots[position],value=>{slots[position]=typeof value==='function'?value(slots[position]):value;}];
    },
    useRef(initial){
      const position=index++;
      return slots[position]??= {current:initial};
    },
    useEffect(effect,deps){
      const position=index++;
      const old=slots[position];
      if(!old||deps.some((value,i)=>value!==old.deps[i])){
        old?.cleanup?.();
        const entry={deps};slots[position]=entry;
        pending.push(()=>{entry.cleanup=effect();});
      }
    }
  };
  const jsx=(type,props,key)=>({type,props:props??{},key});
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(new URL(`../components/${file}.tsx`,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}
  }).outputText;
  vm.runInNewContext(code,{
    exports,process:{env:{NEXT_PUBLIC_TURNSTILE_SITE_KEY:'public-test-site-key'}},
    require(name){
      if(name==='react')return react;
      if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
      if(name==='next/script')return {default:'Script'};
      return modules[name]??{};
    },...globals
  });
  return {
    render(){index=0;return exports[file]();},
    renderProps(props){index=0;return exports[file](props);},
    flush(){while(pending.length)pending.shift()();},
    cleanup(){for(const slot of slots)slot?.cleanup?.();}
  };
}

function elements(node) {
  if(!node||typeof node!=='object')return [];
  return [node,...[node.props?.children].flat(Infinity).flatMap(elements)];
}
function find(tree,predicate){return elements(tree).find(predicate);}
function portal() {
  const calls=[];
  let finish;
  const service=new Promise(resolve=>{finish=resolve;});
  const auth=Object.fromEntries(['signUp','signInWithPassword','resetPasswordForEmail','signInWithOAuth'].map(name=>[
    name,(...args)=>{calls.push({name,args});return service;}
  ]));
  const h=harness('AuthPortal',{
    '@/lib/supabase':{db:()=>({auth}),hasConfig:()=>true},
    './LanguageProvider':{useLanguage:()=>({t:key=>key})},
    './TurnstileChallenge':{TurnstileChallenge:'Challenge'}
  },{location:{origin:'https://local-test.invalid',assign(){}}});
  function render(){return h.render();}
  function switchMode(label){find(render(),n=>n.type==='button'&&n.props.children===label).props.onClick();}
  function fill(){
    for(const node of elements(render()).filter(n=>n.type==='input')){
      node.props.onChange({target:{value:node.props.type==='email'?'tester@example.invalid':node.props.type==='text'?'Tester':'long-test-password'}});
    }
  }
  function challenge(){return find(render(),n=>n.type==='Challenge');}
  function submit(tree=render()){return find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});}
  return {calls,finish,render,switchMode,fill,challenge,submit};
}

for(const [mode,method,label] of [
  ['signup','signUp',null],['login','signInWithPassword','signIn'],['forgot','resetPasswordForEmail','forgotLink']
])test(`${mode}: transmit token, reject same-tick duplicate, reset after network failure`,async()=>{
  const p=portal();
  if(label==='signIn')p.switchMode(label);
  if(label==='forgotLink'){
    p.switchMode('signIn');
    find(p.render(),n=>n.type==='button'&&n.props.className==='forgot-link').props.onClick();
  }
  p.fill();p.challenge().props.onToken('verified-token');
  const tree=p.render();
  const originalKey=p.challenge().key;
  const request=p.submit(tree);
  await p.submit(tree);
  assert.equal(p.calls.length,1);
  assert.equal(p.calls[0].name,method);
  const args=p.calls[0].args;
  assert.equal(method==='resetPasswordForEmail'?args[1].captchaToken:args[0].options.captchaToken,'verified-token');
  assert.equal(find(p.render(),n=>n.props.className==='auth-submit'||n.props.className?.includes('auth-submit')).props.disabled,true);
  p.finish({data:{session:null},error:new Error('Mock network failure')});await request;
  assert.notEqual(p.challenge().key,originalKey);
  await p.submit();assert.equal(p.calls.length,1,'a consumed token must not be reused');
});

test('token expiry blocks even a stale rendered submit handler',async()=>{
  const p=portal();p.fill();p.challenge().props.onToken('verified-token');
  const tree=p.render();p.challenge().props.onToken('');
  await p.submit(tree);assert.equal(p.calls.length,0);
});

test('mode switches invalidate verification and cannot interrupt an active request',async()=>{
  const p=portal();p.fill();p.challenge().props.onToken('verified-token');
  p.switchMode('signIn');await p.submit();assert.equal(p.calls.length,0);
  p.challenge().props.onToken('fresh-token');const request=p.submit();
  const key=p.challenge().key;
  p.switchMode('signUp');assert.equal(p.challenge().key,key);
  p.finish({error:null});await request;
});

test('widget expiry, timeout, error and unmount invalidate or remove the widget',()=>{
  let options;const removed=[];const tokens=[];let errors=0;
  const h=harness('TurnstileChallenge',{}, {window:{turnstile:{
    render(_container,value){options=value;return 'widget-id';},remove(id){removed.push(id);}
  }}});
  const props={siteKey:'public-test-site-key',onToken:token=>tokens.push(token),onError:()=>errors++};
  let tree=h.renderProps(props);
  find(tree,n=>n.type==='div').props.ref.current={};
  h.flush();find(tree,n=>n.type==='Script').props.onReady();
  tree=h.renderProps(props);h.flush();
  options.callback('valid');options['expired-callback']();options['timeout-callback']();options['error-callback']();
  assert.deepEqual(tokens,['valid','','','']);assert.equal(errors,1);
  h.cleanup();assert.deepEqual(removed,['widget-id']);
  options.callback('late');assert.equal(tokens.length,4);
});

test('script failure and widget render exceptions report failure and clear the token',()=>{
  let errors=0;const tokens=[];
  const h=harness('TurnstileChallenge',{}, {window:{turnstile:{render(){throw new Error('mock render failure');}}}});
  const props={siteKey:'public-test-site-key',onToken:token=>tokens.push(token),onError:()=>errors++};
  const tree=h.renderProps(props);find(tree,n=>n.type==='div').props.ref.current={};
  h.flush();const script=find(tree,n=>n.type==='Script');script.props.onError();script.props.onReady();
  h.renderProps(props);h.flush();
  assert.deepEqual(tokens,['','']);assert.equal(errors,2);
});

test('sign-up accepts 6-digit, 7-character alphanumeric and symbol passwords, rejects fewer than six',async()=>{
  for(const password of ['123456','pcw2006','Ab!123']){
    const p=portal();
    p.fill();
    const passwordInput=find(p.render(),n=>n.type==='input'&&n.props.autoComplete==='new-password');
    assert.equal(passwordInput.props.minLength,6);
    passwordInput.props.onChange({target:{value:password}});
    p.challenge().props.onToken('valid-test-token');
    const submit=p.submit();
    assert.equal(p.calls.length,1,`Expected accepted password: ${password}`);
    p.finish({data:{session:null},error:null});
    await submit;
  }
  const p=portal();
  p.fill();
  find(p.render(),n=>n.type==='input'&&n.props.autoComplete==='new-password').props.onChange({target:{value:'12345'}});
  p.challenge().props.onToken('valid-test-token');
  await p.submit();
  assert.equal(p.calls.length,0,'Five-character password must not submit');
});
