import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const port = Number(process.env.PORT || 3000);
const mongoUri = String(process.env.MONGODB_URI || '').trim();
const mongoDbName = String(process.env.MONGODB_DB || 'eduquiz_medici').trim();

function cleanOptions(options){
  return (Array.isArray(options)?options:[]).filter(v=>{
    const s=String(v??'').trim();
    return s && s!=='21';
  });
}

const rawQuestions=JSON.parse(readFileSync(new URL('./questions.json', import.meta.url),'utf8'));
const questions=rawQuestions.map((q,i)=>(
  {
    id:`q${String(i+1).padStart(4,'0')}`,
    discipline:String(q.discipline||'História'),
    axis:String(q.axis||''),
    grade:String(q.grade||'geral'),
    type:String(q.type||'multipla_escolha'),
    text:String(q.text||''),
    options:cleanOptions(q.options),
    correct:Number(q.correct)
  }
)).filter(q=>q.text && q.options.length>=2 && Number.isInteger(q.correct) && q.correct>=0 && q.correct<q.options.length);
const questionMap=new Map(questions.map(q=>[q.id,q]));

function safeQuestion(q){
  return {id:q.id,discipline:q.discipline,axis:q.axis,grade:q.grade,type:q.type,text:q.text,options:[...q.options]};
}
function normalizeName(v){ return String(v||'').trim().replace(/\s+/g,' ').slice(0,80); }
function normalizeClass(v){ return String(v||'').trim().replace(/\s+/g,' ').slice(0,40); }
function shuffled(items){
  const a=[...items];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

let mongoClient=null;
let playsCollection=null;
const memoryPlays=new Map();

async function initStorage(){
  if(!mongoUri){
    console.warn('MONGODB_URI não informado: usando memória temporária. No Render, configure MONGODB_URI para persistir ranking e resultados.');
    return;
  }
  const { MongoClient } = await import('mongodb');
  mongoClient=new MongoClient(mongoUri,{serverSelectionTimeoutMS:10000});
  await mongoClient.connect();
  const db=mongoClient.db(mongoDbName);
  playsCollection=db.collection('partidas');
  await playsCollection.createIndex({finished:1});
  await playsCollection.createIndex({nameKey:1,classKey:1,finished:1});
  console.log(`MongoDB conectado: ${mongoDbName}.partidas`);
}

async function insertPlay(p){
  if(playsCollection){ await playsCollection.insertOne(p); return; }
  memoryPlays.set(p.id,structuredClone(p));
}
async function getPlay(id){
  if(playsCollection) return await playsCollection.findOne({id},{projection:{_id:0}});
  const p=memoryPlays.get(id); return p?structuredClone(p):null;
}
async function updatePlay(id,patch){
  if(playsCollection){ await playsCollection.updateOne({id},{$set:patch}); return; }
  const p=memoryPlays.get(id); if(p) memoryPlays.set(id,{...p,...structuredClone(patch)});
}
async function finishedPlays(){
  if(playsCollection) return await playsCollection.find({finished:{$ne:null}},{projection:{_id:0}}).toArray();
  return [...memoryPlays.values()].filter(p=>p.finished).map(p=>structuredClone(p));
}

async function rankingData(playId=''){
  const source=await finishedPlays();
  const best=new Map();
  for(const p of source){
    const key=(p.nameKey||`${p.name}|${p.class}`.toLocaleLowerCase('pt-BR'));
    const old=best.get(key);
    if(!old || p.correct_count>old.correct_count || (p.correct_count===old.correct_count && new Date(p.finished)<new Date(old.finished))) best.set(key,p);
  }
  const ranking=[...best.values()].sort((a,b)=>b.correct_count-a.correct_count || a.wrong_count-b.wrong_count || new Date(a.finished)-new Date(b.finished));
  const result=ranking.slice(0,100).map((p,i)=>({position:i+1,name:p.name,class:p.class,correct:p.correct_count,wrong:p.wrong_count,percent:Math.round((p.correct_count/10)*100),finished:p.finished}));
  if(!playId) return {ranking:result,rank:null,participants:ranking.length};
  const play=source.find(p=>p.id===playId);
  if(!play) return {ranking:result,rank:null,participants:ranking.length};
  const key=play.nameKey||`${play.name}|${play.class}`.toLocaleLowerCase('pt-BR');
  const rank=ranking.findIndex(p=>(p.nameKey||`${p.name}|${p.class}`.toLocaleLowerCase('pt-BR'))===key)+1;
  return {ranking:result,rank:rank||null,participants:ranking.length};
}

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://local');
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try{
    if(!u.pathname.startsWith('/api/')){
      const staticFiles={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/escola-medici-bg.png':'escola-medici-bg.png'};
      const file=staticFiles[u.pathname];
      if(!file){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'});return res.end('Arquivo não encontrado.');}
      const type=file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.png')?'image/png':'text/html; charset=utf-8';
      const cache=file.endsWith('.png')?'public, max-age=86400':'no-cache';
      res.writeHead(200,{'Content-Type':type,'Cache-Control':cache,'X-Content-Type-Options':'nosniff'});
      return res.end(readFileSync(new URL('./public/'+file,import.meta.url)));
    }

    let body={};
    if(req.method!=='GET'){
      let data='';
      for await(const chunk of req){data+=chunk;if(data.length>100000)return json({error:'Conteúdo muito grande.'},413);}
      body=JSON.parse(data||'{}');
    }

    if(u.pathname==='/api/meta' && req.method==='GET'){
      const counts={}; for(const q of questions) counts[q.grade]=(counts[q.grade]||0)+1;
      return json({total:questions.length,counts});
    }
    if(u.pathname==='/api/health' && req.method==='GET') return json({ok:true,storage:playsCollection?'mongodb':'memory',database:playsCollection?mongoDbName:null});

    if(u.pathname==='/api/start' && req.method==='POST'){
      const name=normalizeName(body.name),className=normalizeClass(body.class);
      if(name.length<2) throw Error('Informe seu nome.');
      if(className.length<1) throw Error('Informe sua série e turma.');
      const exclude=new Set(Array.isArray(body.exclude)?body.exclude.filter(x=>typeof x==='string').slice(0,10):[]);
      let pool=questions.filter(q=>!exclude.has(q.id));
      if(pool.length<10) pool=questions;
      const qs=shuffled(pool).slice(0,10);
      if(qs.length<10) throw Error('Ainda não existem 10 questões diferentes disponíveis no banco.');
      const id=randomUUID(), now=new Date().toISOString();
      const play={id,name,class:className,nameKey:name.toLocaleLowerCase('pt-BR'),classKey:className.toLocaleLowerCase('pt-BR'),grade:'geral',question_ids:qs.map(q=>q.id),answers:[],correct_count:0,wrong_count:0,created:now,finished:null};
      await insertPlay(play);
      return json({id,name,class:className,total:10,questions:qs.map(safeQuestion)},201);
    }

    let m=u.pathname.match(/^\/api\/play\/([a-f0-9-]+)$/);
    if(m && req.method==='GET'){
      const p=await getPlay(m[1]);
      if(!p) return json({error:'Partida não encontrada.'},404);
      const qs=p.question_ids.map(id=>questionMap.get(id)).filter(Boolean);
      const answers=Array.isArray(p.answers)?p.answers:[];
      const answered=answers.map((a,i)=>({index:i,answer:a.answer,ok:a.ok,correctAnswer:qs[i]?.options[qs[i]?.correct]||''}));
      const base={id:p.id,name:p.name,class:p.class,total:10,questions:qs.map(safeQuestion),answered};
      if(p.finished){const r=await rankingData(p.id);return json({...base,finished:true,result:{correct:p.correct_count,wrong:p.wrong_count,percent:Math.round(p.correct_count*10),rank:r.rank,participants:r.participants}});}
      return json({...base,finished:false});
    }

    m=u.pathname.match(/^\/api\/play\/([a-f0-9-]+)\/answer$/);
    if(m && req.method==='POST'){
      const p=await getPlay(m[1]);
      if(!p) return json({error:'Partida não encontrada.'},404);
      if(p.finished) return json({error:'Este quiz já foi concluído.'},400);
      const ids=p.question_ids,answers=Array.isArray(p.answers)?p.answers:[];
      const index=Number(body.index);
      if(!Number.isInteger(index)||index<0||index>=ids.length) throw Error('Questão inválida.');
      if(index!==answers.length) throw Error('Responda as questões na ordem.');
      const q=questionMap.get(ids[index]); if(!q) throw Error('Questão não encontrada.');
      const answer=String(body.answer??'');
      if(!/^\d+$/.test(answer)||!q.options[Number(answer)]) throw Error('Selecione uma alternativa.');
      const ok=Number(answer)===q.correct;
      const nextAnswers=[...answers,{answer,ok}];
      const correctCount=p.correct_count+(ok?1:0),wrongCount=p.wrong_count+(ok?0:1);
      const finished=nextAnswers.length===ids.length?new Date().toISOString():null;
      await updatePlay(p.id,{answers:nextAnswers,correct_count:correctCount,wrong_count:wrongCount,finished});
      const response={ok,correctIndex:q.correct,correctAnswer:q.options[q.correct]||'',answered:nextAnswers.length,total:ids.length,finished:Boolean(finished)};
      if(finished){const r=await rankingData(p.id);response.result={correct:correctCount,wrong:wrongCount,percent:Math.round(correctCount/ids.length*100),rank:r.rank,participants:r.participants};}
      return json(response);
    }

    if(u.pathname==='/api/ranking' && req.method==='GET'){
      const source=await finishedPlays();
      const r=await rankingData();
      const correct=source.reduce((s,p)=>s+Number(p.correct_count||0),0),wrong=source.reduce((s,p)=>s+Number(p.wrong_count||0),0),attempts=correct+wrong;
      const metrics={participants:r.participants,completed:source.length,correctPercent:attempts?Math.round(correct/attempts*100):0,wrongPercent:attempts?Math.round(wrong/attempts*100):0};
      return json({ranking:r.ranking,metrics});
    }

    return json({error:'Rota não encontrada.'},404);
  }catch(e){console.error(e);return json({error:e.message||'Erro inesperado.'},400);}
});

await initStorage();
server.listen(port,'0.0.0.0',()=>console.log(`EduQuiz Médici: http://localhost:${port}`));

async function shutdown(){
  server.close(async()=>{if(mongoClient) await mongoClient.close();process.exit(0);});
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
