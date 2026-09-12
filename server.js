
const express=require("express");
const http=require("http");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server);

app.use(express.static("public"));

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

server.listen(process.env.PORT||3000,()=>console.log("online"));
