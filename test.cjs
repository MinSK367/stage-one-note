'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('./exam-data');
const {questions,fields,grade,exact,diff,initial,normalize,rate,scoreText} = require('./app');
const refs = {
  title:'1:1–8 1:9–20 2 3 4 5 6 7',
  short:'1:9 1:10 1:11 1:13 1:16 1:17 1:19 2:1 2:6 2:9 2:10 2:11 2:14 2:18 2:20 2:28 3:1 3:5 3:8 3:10 3:16 3:17 3:18 4:2 4:3 4:4 4:5 4:6 5:4 5:5 5:6 5:8 5:11 6:4 6:5 6:9 6:10 6:11 6:14 6:15 7:1 7:2 7:10 7:13 7:17',
  verse:'1:1 1:2 1:3 1:20 2:4 2:5 2:17 2:26 2:27 3:12 3:21 4:1 4:8 5:1 5:7 5:9 5:10 6:1 6:2 6:12 6:13 7:3 7:4 7:9'
};
for (const [type,expected] of Object.entries(refs)) assert.equal(questions.filter(q=>q.type===type).map(q=>q.ref).join(' '),expected);
for (const q of questions) {
  const single = ['2:6','2:11','2:28','6:15'].includes(q.ref);
  assert.equal(q.fields.length,q.type==='short'&&!single ? 2 : 1,q.ref);
}
assert.equal(fields.length,118);
assert.equal(new Set(fields.map(f=>f.id)).size,118);
if (process.argv[2]) {
  const verses=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).verses;
  for (const q of questions.filter(q=>q.type!=='title')) {
    assert.equal(normalize(q.parts.length?q.parts.join(''):q.text),normalize(verses[q.ref]),q.ref);
  }
}
assert.ok(exact('하나님의 말씀','하나님의,\n 말 씀!'));
assert.ok(exact('말씀','말씀'.normalize('NFD')));
assert.ok(!exact('하나님의 말씀','하나님은 말씀'));
assert.ok(!exact('있었더니','있었더라'));
assert.ok(!exact('말씀','말씀123'));
assert.match(diff('하나님의 말씀','하나님은 말씀').input,/>은<\/mark>/);
assert.match(diff('하나님의 말씀','하나님 말씀').expected,/>의<\/mark>/);
assert.match(diff('말씀','말£씀').input,/>£<\/mark>/);
assert.match(diff('말씀','말<씀').input,/&lt;/);
const state=initial();
const list=fields.slice(0,3);
const partial=list.map((f,i)=>({id:f.id,input:i===0?f.answer:i===1?'틀림':''}));
for(let i=0;i<3;i++) assert.equal(grade(state,partial,'시험',i).attempt.correct,1);
assert.equal(state.errors[list[1].id].count,3);
assert.equal(state.errors[list[2].id].count,3);
assert.deepEqual(JSON.parse(JSON.stringify(state)),state);
assert.equal(Object.keys(state.mastered).length,1);
const all=fields.map(f=>({id:f.id,input:f.answer}));
assert.equal(rate(grade(state,all,'전체',4).attempt.correct,all.length),100);
assert.equal(Object.keys(state.errors).length,0);
assert.equal(Object.keys(state.mastered).length,118);
assert.equal(state.history.length,4);
assert.equal(scoreText(rate(1,3)),'33.33');
console.log('PASS: 77 prompts, 118 fields, exact grading, differences, error counts, retry, progress, history');
const filteredReview=initial();
const [resolvedField, blankField, untouchedField]=fields;
filteredReview.errors[resolvedField.id]={input:'틀림',count:1};
filteredReview.errors[untouchedField.id]={input:'틀림',count:2};
const {attempt}=grade(filteredReview,[
  {id:resolvedField.id,input:resolvedField.answer},
  {id:blankField.id,input:''}
],'오답 다시 풀기',5,true);
assert.equal(attempt.resolved,1);
assert.equal(filteredReview.errors[resolvedField.id],undefined);
assert.equal(filteredReview.errors[blankField.id].count,1);
assert.equal(filteredReview.errors[untouchedField.id].count,2);
