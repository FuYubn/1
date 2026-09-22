const express=require("express");
const http=require("http");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server);

app.use(express.json({limit:"1mb"}));
app.use(express.static("public"));

const OLLAMA_BASE_URL=(process.env.OLLAMA_BASE_URL||"http://127.0.0.1:11434").replace(/\/$/,"");
const DEEPSEEK_MODEL=process.env.DEEPSEEK_MODEL||"deepseek-r1:8b";

async function askOllama(messages,model=DEEPSEEK_MODEL){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),120000);
 try{
  const response=await fetch(OLLAMA_BASE_URL+"/api/chat",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({model,messages,stream:false}),
   signal:controller.signal
  });

  const raw=await response.text();
  let data;
  try{data=JSON.parse(raw)}catch{data={error:raw||"Invalid Ollama response"}}

  if(!response.ok){
   const err=new Error(data.error||("Ollama HTTP "+response.status));
   err.status=response.status;
   throw err;
  }
  return data;
 }finally{
  clearTimeout(timer);
 }
}

function normalizeMessages(body){
 if(Array.isArray(body.messages)&&body.messages.length){
  return body.messages
   .filter(m=>m&&typeof m.content==="string")
   .map(m=>({role:m.role||"user",content:m.content}));
 }
 if(typeof body.prompt==="string"&&body.prompt.trim()){
  return [{role:"user",content:body.prompt.trim()}];
 }
 return null;
}

app.get("/api/deepseek/health",async(req,res)=>{
 try{
  const response=await fetch(OLLAMA_BASE_URL+"/api/tags");
  if(!response.ok)throw new Error("Ollama HTTP "+response.status);
  const data=await response.json();
  res.json({
   ok:true,
   ollama:OLLAMA_BASE_URL,
   defaultModel:DEEPSEEK_MODEL,
   models:(data.models||[]).map(m=>m.name)
  });
 }catch(error){
  res.status(503).json({
   ok:false,
   error:"无法连接 Ollama，请确认 Ollama 已启动。",
   detail:error.message
  });
 }
});

app.post("/api/deepseek",async(req,res)=>{
 const messages=normalizeMessages(req.body||{});
 if(!messages)return res.status(400).json({error:"请提供 prompt 或 messages。"});

 try{
  const model=req.body.model||DEEPSEEK_MODEL;
  const data=await askOllama(messages,model);
  res.json({
   model:data.model||model,
   message:data.message||{role:"assistant",content:""},
   done:data.done!==false
  });
 }catch(error){
  res.status(error.name==="AbortError"?504:502).json({
   error:error.name==="AbortError"
    ?"DeepSeek 响应超时。"
    :"无法连接 DeepSeek/Ollama，请确认 Ollama 已启动且模型已下载。",
   detail:error.message
  });
 }
});

app.get("/v1/models",(req,res)=>{
 res.json({
  object:"list",
  data:[{id:DEEPSEEK_MODEL,object:"model",owned_by:"local"}]
 });
});

app.post("/v1/chat/completions",async(req,res)=>{
 if(req.body&&req.body.stream===true){
  return res.status(400).json({
   error:{message:"当前代理暂不支持 stream=true，请使用 stream=false。",type:"invalid_request_error"}
  });
 }

 const messages=normalizeMessages(req.body||{});
 if(!messages){
  return res.status(400).json({
   error:{message:"messages 不能为空。",type:"invalid_request_error"}
  });
 }

 try{
  const model=req.body.model||DEEPSEEK_MODEL;
  const data=await askOllama(messages,model);
  res.json({
   id:"chatcmpl-local-"+Date.now(),
   object:"chat.completion",
   created:Math.floor(Date.now()/1000),
   model:data.model||model,
   choices:[{
    index:0,
    message:{role:"assistant",content:data.message?.content||""},
    finish_reason:"stop"
   }],
   usage:{
    prompt_tokens:data.prompt_eval_count||0,
    completion_tokens:data.eval_count||0,
    total_tokens:(data.prompt_eval_count||0)+(data.eval_count||0)
   }
  });
 }catch(error){
  res.status(error.name==="AbortError"?504:502).json({
   error:{
    message:error.name==="AbortError"
     ?"DeepSeek 响应超时。"
     :"无法连接 DeepSeek/Ollama，请确认 Ollama 已启动且模型已下载。",
    type:"api_connection_error",
    detail:error.message
   }
  });
 }
});

const rooms={};

const map=[
"start","normal","lucky","normal","punish",
"lucky","normal","punish","ill","normal",
"normal","lucky","ill","punish","lucky",
"normal","punish","lucky","normal","ill",
"lucky","normal","punish","lucky","ill",
"normal","lucky","normal","sprint","end"
];

const cards=[
"💗 真心话：第一次见对方是什么感觉？",
"🔥 大冒险：说一句夸奖对方的话",
"😂 真心话：最近一次开心的事情",
"🎤 大冒险：唱一句歌"
];

function id(){
 return Math.random().toString(36).slice(2,8).toUpperCase();
}

function send(room){
 io.to(room.id).emit("state",room);
}

io.on("connection",s=>{
 s.on("create",name=>{
  let rid=id();
  rooms[rid]={
   id:rid,
   started:false,
   turn:0,
   players:[{id:s.id,name,pos:1,flying:false}],
   logs:["🏠 房间创建成功"]
  };
  s.join(rid);
  s.room=rid;
  s.emit("room",rid);
  send(rooms[rid]);
 });

 s.on("join",({room,name})=>{
  let r=rooms[room];
  if(!r)return;
  r.players.push({id:s.id,name,pos:1,flying:false});
  s.join(room);
  s.room=room;
  r.logs.unshift(`👋 ${name} 加入`);
  send(r);
 });

 s.on("start",()=>{
  let r=rooms[s.room];
  if(r){
   r.started=true;
   r.logs.unshift("🎮 游戏开始");
   send(r);
  }
 });

 s.on("roll",()=>{
  let r=rooms[s.room];
  if(!r||!r.started)return;

  let p=r.players[r.turn];
  if(!p||p.id!==s.id)return;

  let dice=Math.floor(Math.random()*6)+1;
  r.logs.unshift(`🎲 ${p.name} 掷出 ${dice}`);

  if(p.pos===1&&!p.flying){
   if(dice===6){
    p.flying=true;
    r.logs.unshift("🚀 起飞成功");
   }else{
    r.logs.unshift("☁️ 等待6点起飞");
   }
  }else{
   p.pos+=dice;

   if(p.pos>=30){
    p.pos=30;
    r.logs.unshift(`🏆 ${p.name} 到达终点`);
   }else{
    let event=map[p.pos-1];
    if(event==="lucky"){
     p.pos=Math.min(30,p.pos+2);
     r.logs.unshift("💫 幸运格 前进2格");
    }
    if(event==="ill"){
     p.pos=Math.max(1,p.pos-3);
     r.logs.unshift("💨 厄运 后退3格");
    }
    if(event==="punish"){
     r.logs.unshift(cards[Math.floor(Math.random()*cards.length)]);
    }
   }
  }

  let hit=r.players.find(x=>x!==p&&x.pos===p.pos);
  if(hit){
   hit.pos=1;
   hit.flying=false;
   r.logs.unshift(`💥 ${hit.name} 被撞回起点`);
  }

  r.turn=(r.turn+1)%r.players.length;
  send(r);
 });

 s.on("chat",msg=>{
  let r=rooms[s.room];
  if(r){
   r.logs.unshift("💬 "+msg);
   send(r);
  }
 });

 s.on("disconnect",()=>{
  let r=rooms[s.room];
  if(r){
   r.players=r.players.filter(p=>p.id!==s.id);
   send(r);
  }
 });
});

server.listen(process.env.PORT||3000,()=>{
 console.log("online");
 console.log("DeepSeek proxy: http://127.0.0.1:"+(process.env.PORT||3000)+"/v1/chat/completions");
 console.log("Ollama: "+OLLAMA_BASE_URL+" | model: "+DEEPSEEK_MODEL);
});
