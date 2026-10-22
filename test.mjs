import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('fluxo geral sem SQLite: sorteio, correção, final e ranking', async()=>{
  const port=31988;
  const env={...process.env,PORT:String(port)};
  delete env.MONGODB_URI;
  const child=spawn(process.execPath,['server.js'],{env,stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('exit',c=>reject(Error('servidor encerrou '+c)));setTimeout(()=>reject(Error('timeout')),8000).unref();});
    const call=async(path,method='GET',body)=>{const r=await fetch('http://localhost:'+port+'/api'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
    const meta=await call('/meta'); assert.equal(meta.status,200); assert.equal(meta.data.total,100);
    const health=await call('/health'); assert.equal(health.data.ok,true); assert.equal(health.data.storage,'memory');
    const start=await call('/start','POST',{name:'Aluno Teste',class:'8º ano EF • Turma A'});
    assert.equal(start.status,201); assert.equal(start.data.questions.length,10);
    for(const q of start.data.questions){assert.equal(q.correct,undefined);assert.ok(q.options.length>=2&&q.options.length<=6);assert.ok(!q.options.includes('21'));}
    const id=start.data.id;
    for(let i=0;i<10;i++){
      const r=await call('/play/'+id+'/answer','POST',{index:i,answer:'0'});
      assert.equal(r.status,200); assert.equal(typeof r.data.ok,'boolean'); assert.ok(r.data.correctAnswer);
      assert.equal(r.data.finished,i===9);
    }
    const play=await call('/play/'+id); assert.equal(play.data.finished,true); assert.equal(play.data.result.correct+play.data.result.wrong,10);
    const rank=await call('/ranking'); assert.equal(rank.status,200); assert.equal(rank.data.ranking.length,1); assert.equal(rank.data.ranking[0].name,'Aluno Teste');
    const second=await call('/start','POST',{name:'Aluno Teste',class:'8º ano EF • Turma A',exclude:start.data.questions.map(q=>q.id)});
    assert.equal(second.status,201); assert.equal(second.data.questions.some(q=>start.data.questions.some(old=>old.id===q.id)),false);
  }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
