// Static staging UI, serve only with the isolated API on the same origin.
const status=document.getElementById('status');
const messages=document.getElementById('messages'),notices=document.getElementById('notices');
async function read(path){const res=await fetch(path,{credentials:'same-origin',cache:'no-store'});if(!res.ok)throw Error('Unavailable');return res.json();}
function show(list,rows,label){list.replaceChildren();for(const row of rows){const li=document.createElement('li');li.textContent=label(row);list.append(li);}}
document.getElementById('refresh').addEventListener('click',async()=>{
 messages.replaceChildren();notices.replaceChildren();status.textContent='正在刷新';
 try{const [m,n]=await Promise.all([read('/api/v2/messages'),read('/api/v2/notifications')]);show(messages,m.messages,x=>x.body);show(notices,n.notifications,x=>x.read_at?'已读通知':'未读私信通知');status.textContent='刷新完成';}
 catch{status.textContent='未登录或服务不可用，请重新验证身份';}
});
