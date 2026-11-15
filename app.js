'use strict';

const names = {title:'계시록 장별 제목', short:'성구 단답형', verse:'성구 서술형'};
const marks = ['①', '②'];
const key = 'stage-one-note:v1';
const ignored = /[\s\p{P}]/u;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const normalize = value => [...value.normalize('NFC')].filter(c => !ignored.test(c)).join('');
const rate = (count,total) => total ? count / total * 100 : 0;
const exact = (answer,input) => normalize(answer) === normalize(input);
const scoreText = score => new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(score);

const questions = EXAM.map(row => {
  const parts = row.type === 'short' ? row.text.split(/\[([^\]]+)\]/g) : [];
  const answers = parts.length ? parts.filter((_,i) => i % 2) : [row.text];
  return {...row, parts, chapter:Number(row.ref.split(':')[0]), fields:answers.map((answer,i) => ({
    answer, id:row.type + '-' + row.ref + '-' + i, index:i
  }))};
});
const fields = questions.flatMap(q => q.fields.map(f => ({...f,question:q})));
const byId = new Map(fields.map(f => [f.id,f]));
const initial = () => ({mastered:{}, errors:{}, history:[]});

function grade(state, answers, label, time) {
  const results = answers.map(({id,input}) => {
    const field = byId.get(id);
    const correct = exact(field.answer,input);
    if (correct) {
      state.mastered[id] = true;
      delete state.errors[id];
    } else {
      state.errors[id] = {input, count:(state.errors[id]?.count || 0) + 1};
    }
    return {field,input,correct};
  });
  const correct = results.filter(r => r.correct).length;
  const attempt = {label,time,correct,total:results.length};
  state.history.push(attempt);
  return {results,attempt};
}

function diff(expected,input) {
  const parse = value => {
    const raw = [...value.normalize('NFC')];
    const indices = raw.flatMap((letter,i) => ignored.test(letter) ? [] : [i]);
    return {raw,indices,letters:indices.map(i => raw[i])};
  };
  const a = parse(expected);
  const b = parse(input);
  const m = a.letters.length;
  const n = b.letters.length;
  const table = Array.from({length:m+1}, () => new Uint16Array(n+1));
  for(let i=m;i>=0;i--) {
    for(let j=n;j>=0;j--) {
      if(i===m) table[i][j]=n-j;
      else if(j===n) table[i][j]=m-i;
      else if(a.letters[i]===b.letters[j]) table[i][j]=table[i+1][j+1];
      else table[i][j]=1+Math.min(table[i+1][j+1],table[i+1][j],table[i][j+1]);
    }
  }
  const left=new Set();
  const right=new Set();
  let i=0,j=0;
  while(i<m || j<n) {
    if(i<m && j<n && a.letters[i]===b.letters[j]) { i++; j++; }
    else if(i<m && j<n && table[i][j]===1+table[i+1][j+1]) {
      left.add(a.indices[i++]); right.add(b.indices[j++]);
    } else if(i<m && table[i][j]===1+table[i+1][j]) left.add(a.indices[i++]);
    else right.add(b.indices[j++]);
  }
  const format=(side,changed)=>side.raw.map((c,k)=>changed.has(k) ? '<mark class="changed">'+escape(c)+'</mark>' : escape(c)).join('');
  return {expected:format(a,left), input:format(b,right)};
}

if (typeof module !== 'undefined') module.exports={questions,fields,normalize,exact,grade,initial,diff,rate,scoreText};
if (typeof document !== 'undefined') run();

function run() {
  let state = initial();
  try { state = JSON.parse(localStorage.getItem(key)) || initial(); } catch {}
  const screen = document.querySelector('#screen');
  const settings = {type:'title', chapter:'all'};
  const date = new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'});
  const title = (text,description) => '<h1>'+text+'</h1><p class="muted">'+description+'</p>';
  const done = list => list.filter(f => state.mastered[f.id]).length;
  const progress = (count,total,label) => '<progress value="'+count+'" max="'+total+'" aria-label="'+label+'"></progress>';
  const refLabel = q => q.type === 'title' ? q.ref.replace(':','장 ') + (q.ref.includes(':') ? '절' : '장') : '계 '+q.ref;
  const fieldName = field => refLabel(field.question)+(field.question.type==='short' ? ' '+marks[field.index] : '');
  const message = (input,answer) => {
    const marked = diff(answer,input);
    return '<div class="feedback"><strong class="incorrect">'+(input.trim()?'오답':'미입력')+'</strong><br>내 답안 '+(marked.input || '—')+'<br>정답 '+marked.expected+'</div>';
  };

  function home() {
    screen.replaceChildren(document.querySelector('#home-template').content.cloneNode(true));
    const count=done(fields);
    screen.querySelector('#total').innerHTML='전체 학습 진척도<strong>'+scoreText(rate(count,fields.length))+'%</strong>'+progress(count,fields.length,'전체 학습 진척도')+'<div>'+count+' / '+fields.length+' 정답 경험</div>';
    screen.querySelector('#modes').innerHTML=Object.entries(names).map(([type,name])=>{
      const rows=questions.filter(q=>q.type===type);
      const list=fields.filter(f=>f.question.type===type);
      const amount=rows.length+(type==='title'?'문항': '절')+(type==='short'?' · '+list.length+'빈칸':'');
      return '<a class="mode" href="#study/'+type+'"><strong>'+name+'</strong><small>'+amount+' · '+done(list)+'/'+list.length+' 완료</small></a>';
    }).join('');
    screen.querySelector('#chapters').innerHTML=Array.from({length:7},(_,i)=>{
      const chapter=i+1;
      const list=fields.filter(f=>f.question.chapter===chapter);
      return '<div class="chapter"><strong>'+chapter+'장</strong>'+progress(done(list),list.length,chapter+'장 성취도')+'<span>'+done(list)+' / '+list.length+'</span></div>';
    }).join('');
  }

  function fieldControl(field, label, isVerse=false) {
    const id=escape(field.id);
    const common='id="'+id+'" name="'+id+'" maxlength="1600" autocomplete="off" spellcheck="false"';
    if(isVerse) return '<label class="sr-only" for="'+id+'">'+label+'</label><textarea '+common+'></textarea>';
    return '<input '+common+' class="'+(field.question.type==='short'?'':'full')+'" aria-label="'+label+'">';
  }

  function exercise(rows,label,review,returnHash) {
    const host=screen.querySelector('#exercise');
    host.innerHTML='<form class="stack" id="quiz">'+rows.map(({q,list})=>{
      let content;
      if(q.type==='short') {
        content='<div class="verse-text">'+q.parts.map((p,i)=>{
          if(!(i%2)) return escape(p);
          const index=(i-1)/2;
          const field=list.find(f=>f.index===index);
          return field ? '<span class="blank"><span aria-hidden="true">'+marks[index]+'</span>'+fieldControl(field,fieldName(field))+'</span>' : '<span class="muted">('+marks[index]+' '+escape(p)+')</span>';
        }).join('')+'</div>';
      } else content=fieldControl(list[0],fieldName(list[0]),q.type==='verse');
      return '<article class="question"><h2>'+refLabel(q)+'</h2><small>시험지 '+q.page+'쪽</small>'+content+'<div class="stack" data-feedback></div></article>';
    }).join('')+'<div class="panel" id="result" role="status" tabindex="-1" hidden></div><div class="actions"><button type="submit">채점하기</button><button type="button" class="secondary" id="restart" hidden>다시 풀기</button></div></form>';
    const form=host.querySelector('form');
    const result=form.querySelector('#result');
    const submit=form.querySelector('[type=submit]');
    const restart=form.querySelector('#restart');
    let submitted=false;
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(submitted) return;
      const answers=rows.flatMap(({list})=>list.map(f=>({id:f.id,input:form.elements.namedItem(f.id).value})));
      if(!answers.some(a=>normalize(a.input))) {
        result.hidden=false;
        result.textContent='답안을 하나 이상 입력하세요.';
        result.focus();
        return;
      }
      submitted=true;
      const {results,attempt}=grade(state,answers,label,Date.now());
      let saved=true;
      try { localStorage.setItem(key,JSON.stringify(state)); } catch { saved=false; }
      for(const {field,input,correct} of results) {
        const control=form.elements.namedItem(field.id);
        control.readOnly=true;
        control.setAttribute('aria-invalid',String(!correct));
        const status=control.closest('article').querySelector('[data-feedback]');
        const item=document.createElement('div');
        item.innerHTML=(field.question.type==='short'?'<small>'+marks[field.index]+'</small> ':'')+(correct?'<strong class="correct">정답</strong>':message(input,field.answer));
        status.append(item);
      }
      const score=scoreText(rate(attempt.correct,attempt.total));
      result.hidden=false;
      result.innerHTML='<span class="score">'+score+' / 100점</span> · '+attempt.correct+' / '+attempt.total+' 정답'+(saved?'':'<p class="incorrect">브라우저에 학습 기록을 저장할 수 없습니다.</p>');
      submit.disabled=true;
      restart.hidden=false;
      restart.textContent=review?'오답노트로 돌아가기':'다시 풀기';
      result.focus();
    });
    restart.addEventListener('click',()=>{
      if(review) location.hash=returnHash;
      else { exercise(rows,label,false); host.querySelector('input,textarea').focus(); }
    });
  }

  function study(type) {
    if(Object.hasOwn(names,type)) settings.type=type;
    screen.innerHTML=title('암기훈련','유형과 장을 선택하세요. 띄어쓰기와 문장부호는 채점에서 제외합니다.')+'<div class="filters"><label>유형<select id="type">'+Object.entries(names).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label><label>범위<select id="chapter"><option value="all">1~7장 전체</option>'+Array.from({length:7},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'장</option>').join('')+'</select></label></div><div id="exercise"></div>';
    const chapter=screen.querySelector('#chapter');
    const mode=screen.querySelector('#type');
    chapter.value=settings.chapter;
    mode.value=settings.type;
    const update=()=>{
      settings.type=mode.value;
      settings.chapter=chapter.value;
      window.history.replaceState(null,'','#study/'+mode.value);
      const rows=questions.filter(q=>q.type===mode.value && (chapter.value==='all'||q.chapter===Number(chapter.value)));
      exercise(rows.map(q=>({q,list:q.fields.map(f=>byId.get(f.id))})),names[mode.value]+' · '+chapter.selectedOptions[0].text,false);
    };
    chapter.addEventListener('change',update);
    mode.addEventListener('change',update);
    update();
  }

  function review(mode) {
    const rows=questions.map(q=>({q,list:q.fields.filter(f=>state.errors[f.id]).map(f=>byId.get(f.id))})).filter(r=>r.list.length);
    if(mode==='practice' && rows.length) {
      screen.innerHTML=title('오답 다시 풀기','정답을 제출하면 해당 항목이 오답노트에서 빠집니다.')+'<div id="exercise"></div>';
      exercise(rows,'오답 다시 풀기',true,'#review');
      return;
    }
    screen.innerHTML=title('오답노트','틀리거나 비워 둔 항목을 다시 풀 수 있어요.')+(rows.length?'<p><a class="button" href="#review/practice">오답 다시 풀기</a></p><div class="stack">'+rows.map(({q,list})=>'<article class="question"><h2>'+refLabel(q)+'</h2><small>'+names[q.type]+'</small>'+list.map(f=>{
      const entry=state.errors[f.id];
      return '<p><strong>'+fieldName(f)+'</strong> · '+entry.count+'회'+(entry.count>=3?' ★':'')+'</p>'+message(entry.input,f.answer);
    }).join('')+'</article>').join('')+'</div>':'<div class="panel">기록된 오답이 없습니다.</div>');
  }

  function history() {
    const records=state.history;
    screen.innerHTML=title('학습기록','제출한 회차의 점수와 변화를 볼 수 있어요.');
    if(!records.length) { screen.innerHTML+='<div class="panel">아직 제출한 회차가 없습니다.</div>'; return; }
    const keyOf = r=>r.label;
    const labels=[...new Set(records.map(keyOf))];
    screen.innerHTML+='<div class="filters"><label>유형과 범위<select id="history-filter">'+labels.map((label,i)=>'<option value="'+i+'">'+escape(label)+'</option>').join('')+'</select></label></div><section class="panel" id="growth"></section>';
    const filter=screen.querySelector('#history-filter');
    filter.value=String(labels.indexOf(keyOf(records.at(-1))));
    const update=()=>{
      const series=records.filter(r=>r.label===labels[Number(filter.value)]);
      const scores=series.map(r=>rate(r.correct,r.total));
      const recent=scores.slice(-12);
      const change=scores.at(-1)-scores[0];
      const best=scores.reduce((a,b)=>Math.max(a,b),0);
      screen.querySelector('#growth').innerHTML='<h2>성장 분석</h2><p>최고 '+scoreText(best)+'점 · 최근 '+scoreText(scores.at(-1))+'점'+(series.length>1?' · 첫 회차 대비 '+(change>0?'+':'')+scoreText(change)+'점':'')+'</p><small>최근 '+recent.length+'회 점수</small><div class="chart" role="img" aria-label="'+recent.map(scoreText).join(', ')+'점">'+recent.map(s=>'<div style="height:'+Math.max(2,s*1.2)+'px" title="'+scoreText(s)+'점"></div>').join('')+'</div><ol class="records">'+series.slice().reverse().map(r=>'<li><time datetime="'+new Date(r.time).toISOString()+'">'+date.format(r.time)+'</time><strong>'+scoreText(rate(r.correct,r.total))+'점 · '+r.correct+'/'+r.total+'</strong></li>').join('')+'</ol>';
    };
    filter.addEventListener('change',update);
    update();
  }

  function render() {
    const [page,mode]=location.hash.slice(1).split('/');
    const active=['study','review','history'].includes(page)?page:'home';
    for(const link of document.querySelectorAll('nav a')) {
      if(link.hash==='#'+active) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
    if(active==='study') study(mode);
    else if(active==='review') review(mode);
    else if(active==='history') history();
    else home();
    window.scrollTo(0,0);
  }
  window.addEventListener('hashchange',render);
  render();
}