const app=document.querySelector('#app');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentPlay=null;
let rankingTimer=null;
const api=async(path,method='GET',body)=>{const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
function notify(msg){const n=document.querySelector('#notice');n.textContent=msg;n.hidden=false;setTimeout(()=>n.hidden=true,3500);}
function clearRankingTimer(){if(rankingTimer){clearInterval(rankingTimer);rankingTimer=null;}}
function page(html,mode='normal'){clearRankingTimer();document.body.dataset.view=mode;app.innerHTML=html;window.scrollTo({top:0,behavior:'instant'});}

const SERIES=[
  ['6º ano EF','6º ano do Ensino Fundamental'],
  ['7º ano EF','7º ano do Ensino Fundamental'],
  ['8º ano EF','8º ano do Ensino Fundamental'],
  ['9º ano EF','9º ano do Ensino Fundamental'],
  ['1º ano EM','1º ano do Ensino Médio'],
  ['2º ano EM','2º ano do Ensino Médio'],
  ['3º ano EM','3º ano do Ensino Médio']
];

async function home(){
  const meta=await api('/meta');
  const saved=JSON.parse(localStorage.getItem('eduquizStudent')||'{}');
  const savedGrade=saved.grade||'8º ano EF';
  const savedGroup=saved.group||'';
  page(`<div class="home-shell">
    <section class="panel start-panel home-card">
      <div class="home-brand">
        <div class="logo-mark">EQ</div>
        <div>
          <p class="eyebrow">E.E. Presidente Médici • Naviraí-MS</p>
          <h1>EduQuiz Médici</h1>
        </div>
      </div>
      <p class="lead home-lead">Responda 10 questões aleatórias, confira a correção e dispute uma posição no ranking da escola.</p>
      <form id="startForm" class="home-form">
        <label>Seu nome<input name="name" autocomplete="name" maxlength="80" required value="${esc(saved.name||'')}" placeholder="Digite seu nome"></label>
        <div class="school-fields">
          <label>Série
            <select name="grade" required aria-label="Selecione a série">
              ${SERIES.map(([value,label])=>`<option value="${value}" ${value===savedGrade?'selected':''}>${label}</option>`).join('')}
            </select>
          </label>
          <label>Turma<input name="group" maxlength="12" required value="${esc(savedGroup)}" placeholder="Ex.: A" autocomplete="off"></label>
        </div>
        <button class="primary big start-cta" type="submit"><span>▶</span> Começar quiz</button>
      </form>
      <button id="rankingBtn" class="secondary big rank-cta" type="button"><span>🏆</span> Ver ranking</button>
      <div class="home-features">
        <span>📚 ${meta.total} questões</span><span>🎯 10 por rodada</span><span>📊 resultado no final</span>
      </div>
    </section>
  </div>`,'home');
  document.querySelector('#startForm').onsubmit=async e=>{
    e.preventDefault();
    const form=Object.fromEntries(new FormData(e.target));
    const group=String(form.group||'').trim().toUpperCase();
    if(!group){notify('Informe a turma.');return;}
    const savedData={name:form.name,grade:form.grade,group};
    const data={name:form.name,class:`${form.grade} • Turma ${group}`};
    try{
      localStorage.setItem('eduquizStudent',JSON.stringify(savedData));
      currentPlay=await api('/start','POST',data);
      localStorage.setItem('eduquizPlay',currentPlay.id);
      renderQuestion(0);
    }catch(err){notify(err.message);}
  };
  document.querySelector('#rankingBtn').onclick=()=>{history.pushState({},'', '/ranking');ranking();};
}

function renderQuestion(index){
  const q=currentPlay.questions[index];
  const progress=Math.round((index/currentPlay.total)*100);
  page(`<div class="quiz-shell quiz-shell-v28">
    <div class="quiz-brand-mini" aria-label="EduQuiz Médici">
      <div class="quiz-brand-icon">EQ</div>
      <div class="quiz-brand-copy"><strong>EduQuiz <span>Médici</span></strong><small>E.E. Presidente Médici</small></div>
      <button id="exitQuiz" class="quiz-exit" type="button">Sair</button>
    </div>
    <div class="player-card">
      <div class="player-avatar">👤</div>
      <div class="player-info"><strong>${esc(currentPlay.name)}</strong><span>${esc(currentPlay.class)}</span></div>
      <div class="question-number">Questão <b>${index+1}</b> de ${currentPlay.total}</div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${progress}%"></div></div>
    </div>
    <section class="panel question-card question-card-v28">
      <div class="question-scroll">
        <div class="topic-row"><span class="topic-icon">📖</span><span class="topic">${esc(q.axis)}</span></div>
        <h1>${esc(q.text)}</h1>
        <form id="answerForm" class="answers">
          <div class="answer-list">
            ${q.options.filter(o=>String(o??'').trim() && String(o).trim()!=='21').map((o,i)=>`<label class="answer-option"><input type="radio" name="answer" value="${i}" required><span class="choice-ring"></span><span class="letter">${String.fromCharCode(65+i)}</span><span class="answer-text">${esc(o)}</span></label>`).join('')}
          </div>
          <div id="feedback"></div>
          <div class="answer-action"><button class="primary big answer-v28" id="confirmBtn">Responder <span aria-hidden="true">→</span></button></div>
        </form>
      </div>
    </section>
  </div>`,'quiz');
  document.querySelector('#exitQuiz').onclick=()=>{if(confirm('Sair deste quiz? O resultado só entra no ranking quando as 10 questões forem concluídas.')){localStorage.removeItem('eduquizPlay');history.replaceState({},'', '/');home();}};
  document.querySelector('#answerForm').onsubmit=async e=>{
    e.preventDefault();
    const chosen=new FormData(e.target).get('answer');
    const btn=document.querySelector('#confirmBtn');btn.disabled=true;
    try{
      const r=await api('/play/'+currentPlay.id+'/answer','POST',{index,answer:chosen});
      e.target.querySelectorAll('input').forEach(x=>x.disabled=true);
      const labels=[...e.target.querySelectorAll('.answer-option')];
      labels.forEach((label,i)=>{if(i===r.correctIndex)label.classList.add('correct'); if(i===Number(chosen)&&i!==r.correctIndex)label.classList.add('wrong');});
      const fb=document.querySelector('#feedback');
      fb.innerHTML=`<div class="feedback ${r.ok?'feedback-ok':'feedback-wrong'}"><strong>${r.ok?'✓ Você acertou!':'✗ Você errou.'}</strong>${r.ok?'':`<p>Resposta correta: <b>${esc(r.correctAnswer)}</b></p>`}</div>`;
      btn.textContent=r.finished?'Ver resultado final':'Próxima questão';
      btn.type='button';
      btn.disabled=false;
      btn.onclick=async()=>{
        if(!r.finished) return renderQuestion(index+1);
        btn.disabled=true;
        btn.textContent='Carregando resultado...';
        try{
          const finalPlay=await api('/play/'+currentPlay.id);
          currentPlay={...currentPlay,...finalPlay};
          showResult(finalPlay.result);
        }catch(err){
          btn.disabled=false;
          btn.textContent='Ver resultado final';
          notify(err.message);
        }
      };
    }catch(err){btn.disabled=false;notify(err.message);}
  };
}

function showResult(result){
  localStorage.removeItem('eduquizPlay');
  page(`<div class="result-shell"><section class="result-hero">
    <div class="result-score">${result.correct}<small>/10</small></div>
    <p class="eyebrow">Quiz concluído</p>
    <h1>${esc(currentPlay.name)}, seu resultado</h1>
    <div class="metrics">
      <div><strong>${result.correct}</strong><span>Acertos</span></div>
      <div><strong>${result.wrong}</strong><span>Erros</span></div>
      <div><strong>${result.percent}%</strong><span>Aproveitamento</span></div>
      <div><strong>${result.rank?result.rank+'º':'—'}</strong><span>Ranking geral</span></div>
    </div>
    <p class="ranking-note">${result.participants?`Entre ${result.participants} participante(s).`:'Primeira participação no ranking.'}</p>
    <button id="more10" class="primary big">Sortear mais 10 questões</button>
    <button id="playAgain" class="secondary big">Jogar novamente</button>
    <button id="seeRank" class="text-btn wide">Ver ranking completo</button>
    <button id="backHome" class="text-btn wide">Voltar ao início</button>
  </section></div>`,'result');
  document.querySelector('#more10').onclick=async()=>{
    try{
      currentPlay=await api('/start','POST',{name:currentPlay.name,class:currentPlay.class,exclude:currentPlay.questions.map(q=>q.id)});
      localStorage.setItem('eduquizPlay',currentPlay.id);
      renderQuestion(0);
    }catch(e){notify(e.message);}
  };
  document.querySelector('#playAgain').onclick=()=>{history.replaceState({},'', '/');home().catch(e=>notify(e.message));};
  document.querySelector('#seeRank').onclick=()=>{history.pushState({},'', '/ranking');ranking();};
  document.querySelector('#backHome').onclick=()=>{history.replaceState({},'', '/');home().catch(e=>notify(e.message));};
}


function rankingMarkup(data){
  const m=data.metrics;
  return `<section class="scoreboard">
    <div class="scoreboard-head">
      <div><p class="eyebrow">E.E. Presidente Médici</p><h1>Ranking EduQuiz</h1><p class="live-label"><span></span> Atualização automática</p></div>
      <button id="backHome" class="secondary" type="button">Voltar ao quiz</button>
    </div>
    <div class="scoreboard-metrics">
      <article><strong>${m.participants}</strong><span>Participantes</span></article>
      <article><strong>${m.completed}</strong><span>Quizzes concluídos</span></article>
      <article class="metric-ok"><strong>${m.correctPercent}%</strong><span>Acertos</span></article>
      <article class="metric-bad"><strong>${m.wrongPercent}%</strong><span>Erros</span></article>
    </div>
    <div class="scoreboard-table">
      <div class="scoreboard-row scoreboard-header"><span>Pos.</span><span>Aluno / turma</span><span>Acertos</span><span>Aproveitamento</span></div>
      ${data.ranking.length?data.ranking.slice(0,10).map((r,i)=>`<article class="scoreboard-row ${i<3?'podium p'+(i+1):''}"><span class="position">${i===0?'🥇':i===1?'🥈':i===2?'🥉':r.position+'º'}</span><span class="student"><strong>${esc(r.name)}</strong><small>${esc(r.class)}</small></span><span class="score">${r.correct}/10</span><span class="percent">${r.percent}%</span></article>`).join(''):'<div class="empty">Ainda não há resultados no ranking.</div>'}
    </div>
    <p class="scoreboard-foot">Top 10 • O ranking considera o melhor resultado de cada aluno/turma.</p>
  </section>`;
}

async function refreshRanking(){
  const data=await api('/ranking');
  const old=document.querySelector('.scoreboard');
  if(!old) return;
  const wrapper=document.createElement('div');wrapper.innerHTML=rankingMarkup(data);
  old.replaceWith(wrapper.firstElementChild);
  bindRankingBack();
}
function bindRankingBack(){
  const b=document.querySelector('#backHome');
  if(b)b.onclick=()=>{history.pushState({},'', '/');home().catch(e=>notify(e.message));};
}
async function ranking(){
  const data=await api('/ranking');
  page(rankingMarkup(data),'ranking');
  bindRankingBack();
  rankingTimer=setInterval(()=>refreshRanking().catch(()=>{}),3000);
}

async function init(){
  window.addEventListener('popstate',()=>{location.pathname==='/ranking'?ranking().catch(e=>notify(e.message)):home().catch(e=>notify(e.message));});
  if(location.pathname==='/ranking') return ranking().catch(e=>notify(e.message));
  const resume=localStorage.getItem('eduquizPlay');
  if(resume){
    try{
      const p=await api('/play/'+resume);
      currentPlay=p;
      if(p.finished) return showResult(p.result);
      const idx=p.answered.length;
      if(idx<10) return renderQuestion(idx);
    }catch{}
    localStorage.removeItem('eduquizPlay');
  }
  home().catch(e=>notify(e.message));
}
init();
