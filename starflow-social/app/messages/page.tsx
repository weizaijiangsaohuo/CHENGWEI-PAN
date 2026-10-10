
'use client';

import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,Send,ShieldBan} from 'lucide-react';
import {db,hasConfig} from '@/lib/supabase';

type Profile={
  id:string;
  handle:string;
  display_name:string;
};

type DM={
  id:string;
  sender_id:string;
  recipient_id:string;
  body:string;
  created_at:string;
  read_at:string|null;
};

export default function MessagesPage(){
  const [me,setMe]=useState<string|null>(null);
  const [people,setPeople]=useState<Profile[]>([]);
  const [peer,setPeer]=useState<Profile|null>(null);
  const [messages,setMessages]=useState<DM[]>([]);
  const [draft,setDraft]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [blocked,setBlocked]=useState(false);

  useEffect(()=>{
    if(!hasConfig()){
      setError('Supabase 尚未配置');
      return;
    }
    let live=true;
    void db().auth.getUser().then(({data})=>{
      if(live)setMe(data.user?.id??null);
    });
    return()=>{live=false};
  },[]);

  const refresh=useCallback(async()=>{
    if(!me)return;
    const c=db();
    const [
      {data:p,error:pe},
      {data:m,error:de}
    ]=await Promise.all([
      c.from('profiles')
        .select('id,handle,display_name')
        .neq('id',me)
        .order('display_name')
        .limit(100),
      c.from('direct_messages')
        .select('id,sender_id,recipient_id,body,created_at,read_at')
        .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
        .order('created_at',{ascending:true})
        .limit(500)
    ]);

    if(pe||de){
      setError(pe?.message||de?.message||'加载失败');
      return;
    }

    setPeople((p||[]) as Profile[]);
    setMessages((m||[]) as DM[]);
  },[me]);

  useEffect(()=>{
    void refresh();
  },[refresh]);

  useEffect(()=>{
    if(!me||!peer)return;
    let alive=true;
    const c=db();

    void c.from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id',me)
      .eq('blocked_id',peer.id)
      .maybeSingle()
      .then(({data})=>{
        if(alive)setBlocked(!!data);
      });

    return()=>{alive=false};
  },[me,peer]);

  useEffect(()=>{
    if(!me||!peer)return;

    const ids=messages
      .filter(m=>
        m.sender_id===peer.id &&
        m.recipient_id===me &&
        !m.read_at
      )
      .map(m=>m.id);

    if(ids.length){
      void db().from('direct_messages')
        .update({read_at:new Date().toISOString()})
        .in('id',ids)
        .then(()=>{});
    }
  },[me,peer,messages]);

  useEffect(()=>{
    if(!me)return;
    const timer=setInterval(()=>void refresh(),6000);
    return()=>clearInterval(timer);
  },[me,refresh]);

  async function send(){
    if(!me||!peer||!draft.trim()||busy)return;

    setBusy(true);
    setError('');

    const {error:e}=await db()
      .from('direct_messages')
      .insert({
        sender_id:me,
        recipient_id:peer.id,
        body:draft.trim()
      });

    setBusy(false);

    if(e){
      setError(e.message);
      return;
    }

    setDraft('');
    await refresh();
  }

  async function toggleBlock(){
    if(!me||!peer)return;
    setBusy(true);

    const c=db();
    const result=blocked
      ?await c.from('user_blocks')
        .delete()
        .eq('blocker_id',me)
        .eq('blocked_id',peer.id)
      :await c.from('user_blocks')
        .insert({
          blocker_id:me,
          blocked_id:peer.id
        });

    setBusy(false);

    if(result.error){
      setError(result.error.message);
      return;
    }

    setBlocked(!blocked);
  }

  const thread=peer
    ?messages.filter(m=>
      (m.sender_id===me&&m.recipient_id===peer.id) ||
      (m.sender_id===peer.id&&m.recipient_id===me)
    )
    :[];

  const styles={
    panel:{
      background:'rgba(255,255,255,.76)',
      border:'1px solid #f4d9ed',
      borderRadius:22,
      padding:18
    } as const,
    button:{
      border:'1px solid #e7b9df',
      borderRadius:14,
      padding:'9px 13px',
      background:'#fff',
      color:'#92519e'
    } as const
  };

  return (
    <main style={{
      minHeight:'100vh',
      padding:'24px 12px 100px',
      background:'linear-gradient(135deg,#fff0f8,#f2eaff 60%,#e9f5ff)',
      color:'#56385f'
    }}>
      <div style={{maxWidth:980,margin:'auto'}}>
        <Link href="/" style={{
          display:'inline-flex',
          gap:6,
          alignItems:'center',
          marginBottom:20
        }}>
          <ArrowLeft size={18}/>
          返回 Starflow
        </Link>

        <h1 style={{fontSize:30,margin:'0 0 8px'}}>
          ✦ 私信中心
        </h1>
        <p style={{margin:'0 0 22px'}}>
          一对一私密聊天 · Starflow 2.0
        </p>

        {error&&<p role="alert" style={{color:'#b91c55'}}>
          {error}
        </p>}

        {!me
          ?<div style={styles.panel}>
            请先登录 Starflow 后使用私信。
          </div>
          :<div style={{
            display:'grid',
            gridTemplateColumns:'minmax(180px,1fr) minmax(0,2fr)',
            gap:14
          }}>
            <section style={styles.panel}>
              <h2 style={{fontSize:17}}>选择聊天对象</h2>
              <div style={{display:'grid',gap:8}}>
                {people.map(p=>
                  <button
                    key={p.id}
                    onClick={()=>{
                      setPeer(p);
                      setError('');
                    }}
                    style={{
                      ...styles.button,
                      textAlign:'left',
                      background:peer?.id===p.id?'#fce2f5':'#fff'
                    }}
                  >
                    {p.display_name}
                    <small style={{
                      display:'block',
                      opacity:.7
                    }}>
                      @{p.handle}
                    </small>
                  </button>
                )}
              </div>
            </section>

            <section style={styles.panel}>
              {!peer
                ?<p>从左侧选择用户，开始聊天。</p>
                :<>
                  <div style={{
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'space-between',
                    gap:8,
                    flexWrap:'wrap'
                  }}>
                    <h2 style={{fontSize:18}}>
                      {peer.display_name}
                    </h2>
                    <button
                      disabled={busy}
                      style={styles.button}
                      onClick={()=>void toggleBlock()}
                    >
                      <ShieldBan size={15} style={{
                        verticalAlign:'middle'
                      }}/>
                      {' '}
                      {blocked?'解除屏蔽':'屏蔽用户'}
                    </button>
                  </div>

                  <div
                    aria-label="聊天记录"
                    style={{
                      height:390,
                      overflowY:'auto',
                      display:'flex',
                      flexDirection:'column',
                      gap:10,
                      padding:10
                    }}
                  >
                    {thread.map(m=>
                      <div key={m.id} style={{
                        alignSelf:m.sender_id===me
                          ?'flex-end':'flex-start',
                        maxWidth:'85%',
                        padding:'10px 14px',
                        borderRadius:16,
                        background:m.sender_id===me
                          ?'#f6cce9':'#fff',
                        overflowWrap:'anywhere'
                      }}>
                        {m.body}
                        <small style={{
                          display:'block',
                          opacity:.6,
                          marginTop:4
                        }}>
                          {new Date(m.created_at)
                            .toLocaleString('zh-CN')}
                          {m.sender_id===me
                            ?(m.read_at?' · 已读':' · 已发送')
                            :''}
                        </small>
                      </div>
                    )}
                  </div>

                  {blocked
                    ?<p>
                      你已屏蔽该用户。解除屏蔽后可发送消息。
                    </p>
                    :<form
                      onSubmit={e=>{
                        e.preventDefault();
                        void send();
                      }}
                      style={{display:'flex',gap:8}}
                    >
                      <input
                        aria-label="输入消息"
                        value={draft}
                        onChange={e=>setDraft(e.target.value)}
                        maxLength={2000}
                        placeholder="输入消息…"
                        style={{
                          flex:1,
                          minWidth:0,
                          border:'1px solid #e7b9df',
                          borderRadius:12,
                          padding:12
                        }}
                      />
                      <button
                        disabled={busy||!draft.trim()}
                        style={{
                          ...styles.button,
                          background:'#edb5dd'
                        }}
                        type="submit"
                      >
                        <Send size={17}/>
                      </button>
                    </form>
                  }
                </>
              }
            </section>
          </div>
        }
      </div>
    </main>
  );
}
