/*
 * Simulated-student test for the course finder.
 *
 * 1. "Ideal" students: for each program, a student whose traits equal that program's profile.
 *    A healthy system puts that program in the top 3 (ideally #1).
 * 2. "Noisy" students: the same, with random wobble in every trait, many runs each.
 * 3. A few story-based students with mixed interests, to eyeball the results.
 *
 * Usage: node tests/run_personas.js [--runs=20] [--sigma=0.15] [--verbose]
 */
const path = require('path');
const Engine = require('../src/engine.js');

const dataDir = path.join(__dirname, '..', 'data');
const traitsFile = require(path.join(dataDir, 'traits.json'));
const coursesFile = require(path.join(dataDir, 'courses.json'));
const questionsFile = require(path.join(dataDir, 'questions.json'));

const data = {
  traits: traitsFile.traits,
  courses: coursesFile.courses,
  questions: questionsFile.questions,
  strandQuestion: questionsFile.strandQuestion
};
const traitIds = data.traits.map(t => t.id);

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const RUNS = Number(args.runs || 20);
const SIGMA = Number(args.sigma || 0.15);

// ---- small seeded random generator so results are repeatable
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  const u = Math.max(rng(), 1e-9), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function idealPersona(course) {
  const u = {};
  traitIds.forEach(t => {
    const req = (course.profile[t] || 0) / 5;
    u[t] = req > 0 ? req : 0.3;
  });
  return u;
}

function answerFor(q, u, course, rng) {
  if (q.type === 'strand') {
    if (!course) return 5;
    let best = 0;
    course.strand.forEach((v, i) => { if (v > course.strand[best]) best = i; });
    return best;
  }
  if (q.type === 'statement') {
    let s = 0, d = 0;
    for (const t in q.effects) { s += q.effects[t] * (2 * u[t] - 1); d += Math.abs(q.effects[t]); }
    return clamp(Math.round((s / d) * 2) / 2, -1, 1);
  }
  let best = 0, bestScore = -Infinity;
  q.options.forEach((o, i) => {
    let s = 0;
    for (const t in o.effects) s += o.effects[t] * (2 * u[t] - 1);
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}

function simulate(u, course, trace) {
  const session = Engine.createSession(data);
  const rng = mulberry32(1);
  const timeline = [];
  for (let guard = 0; guard < 80; guard++) {
    const q = session.nextQuestion();
    if (!q) break;
    session.answer(q.id, answerFor(q, u, course, rng));
    if (trace) {
      const sn = session.snapshot();
      timeline.push({ asked: sn.asked, race: sn.inRace.length, conf: sn.confidence, lead: sn.leaders[0].id });
    }
  }
  return { results: session.results(), timeline };
}

function rankOf(results, id) {
  const all = results.top3.concat(results.others);
  return all.findIndex(c => c.id === id) + 1;
}

// ------------------------------------------------------------------- run 1
console.log('=== 1. Ideal students (traits exactly match the program) ===');
const rows = [];
for (const c of data.courses) {
  const { results } = simulate(idealPersona(c), c);
  rows.push({ id: c.id, rank: rankOf(results, c.id), asked: results.questionsAnswered, top3: results.top3.map(x => x.short + ' ' + x.match + '%').join(' | ') });
}
rows.forEach(r => console.log(String(r.rank).padStart(2), r.id.padEnd(20), 'Q=' + r.asked, ' ', r.top3));
const ideal1 = rows.filter(r => r.rank === 1).length, ideal3 = rows.filter(r => r.rank <= 3).length;
console.log(`\nIdeal: #1 for ${ideal1}/${rows.length}, top 3 for ${ideal3}/${rows.length}`);

// ------------------------------------------------------------------- run 2
console.log(`\n=== 2. Noisy students (sigma=${SIGMA}, ${RUNS} runs per program) ===`);
const stats = [];
let sumTop1 = 0, sumTop3 = 0, sumQ = 0, total = 0;
for (const c of data.courses) {
  const base = idealPersona(c);
  let top1 = 0, top3 = 0, qsum = 0;
  const wrong = {};
  for (let r = 0; r < RUNS; r++) {
    const rng = mulberry32(1000 + r * 31 + c.id.length * 7 + c.id.charCodeAt(2));
    const u = {};
    traitIds.forEach(t => { u[t] = clamp(base[t] + gauss(rng) * SIGMA, 0, 1); });
    const { results } = simulate(u, c);
    const rk = rankOf(results, c.id);
    if (rk === 1) top1++;
    if (rk <= 3) top3++;
    else { const w = results.top3[0].short; wrong[w] = (wrong[w] || 0) + 1; }
    qsum += results.questionsAnswered;
  }
  const confusions = Object.entries(wrong).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} (${v})`).join(', ');
  stats.push({ id: c.id, top1: top1 / RUNS, top3: top3 / RUNS, q: qsum / RUNS, confusions });
  sumTop1 += top1; sumTop3 += top3; sumQ += qsum; total += RUNS;
}
stats.sort((a, b) => a.top3 - b.top3 || a.top1 - b.top1);
console.log('program'.padEnd(20), 'top1'.padStart(5), 'top3'.padStart(5), '  avgQ   when missed, #1 pick was');
stats.forEach(s => console.log(s.id.padEnd(20), (Math.round(s.top1 * 100) + '%').padStart(5), (Math.round(s.top3 * 100) + '%').padStart(5), '  ' + s.q.toFixed(1).padStart(4), '  ' + s.confusions));
console.log(`\nOverall: top 1 = ${(100 * sumTop1 / total).toFixed(0)}%, top 3 = ${(100 * sumTop3 / total).toFixed(0)}%, average questions = ${(sumQ / total).toFixed(1)}`);

// ------------------------------------------------------------------- run 3
console.log('\n=== 3. Story students (mixed interests) ===');
function story(name, boosts) {
  const u = {};
  traitIds.forEach(t => { u[t] = 0.45; });   // an "average" student for anything not mentioned
  Object.assign(u, boosts);
  const { results } = simulate(u, null);
  console.log(`\n${name}`);
  results.top3.forEach(c => console.log(`   ${c.match}%  ${c.name}  [${c.college}]`));
  console.log('   strongest skills:', results.bestSkills.map(s => `${s.label} ${s.score}`).join(', '));
}
story('Loves coding and math, wants to build apps', { comp: 0.95, math: 0.85, I: 0.85, C: 0.6, A: 0.4 });
story('Kind, patient, loves kids, good at English', { S: 0.95, kids: 0.9, lang: 0.85, A: 0.6, C: 0.6, I: 0.4 });
story('Likes taking engines apart, wants a job fast', { R: 0.95, mech: 0.95, vehicles: 0.95, C: 0.5, math: 0.5 });
story('Fascinated by animals and nature, loves biology', { sci: 0.95, I: 0.9, animals: 0.95, R: 0.5, S: 0.4 });
story('Great with people, loves leading, dreams of a hotel career', { E: 0.9, S: 0.85, hospitality: 0.95, lang: 0.8, A: 0.6, C: 0.5 });
story('Strong in math and physics, wants to build bridges', { math: 0.95, sci: 0.85, R: 0.8, buildings: 0.95, I: 0.6, mech: 0.7, C: 0.6 });
story('Cares about people\'s feelings, curious about the mind', { S: 0.9, I: 0.85, lang: 0.8, A: 0.5, C: 0.4 });
story('Creative, draws a lot, likes buildings and plans', { A: 0.95, R: 0.7, buildings: 0.9, comp: 0.6, math: 0.55, C: 0.5 });

// ------------------------------------------------------------------- run 4
console.log('\n=== 4. How the race narrows (ideal Computer Science student) ===');
const cs = data.courses.find(c => c.id === 'cos-cs');
const tl = simulate(idealPersona(cs), cs, true).timeline;
tl.filter((t, i) => [0, 1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 36].includes(t.asked) || i === tl.length - 1)
  .forEach(t => console.log(`after ${String(t.asked).padStart(2)} questions: ${String(t.race).padStart(2)} programs still in the race, confidence ${Math.round(t.conf * 100)}%, leader = ${t.lead}`));

// ------------------------------------------------------------------- coverage
console.log('\n=== 5. Which questions get used? ===');
const used = {};
for (const c of data.courses) {
  const session = Engine.createSession(data);
  const u = idealPersona(c);
  for (let g = 0; g < 80; g++) {
    const q = session.nextQuestion();
    if (!q) break;
    if (q.id !== 'strand') used[q.id] = (used[q.id] || 0) + 1;
    session.answer(q.id, answerFor(q, u, c, null));
  }
}
const unused = data.questions.filter(q => !used[q.id]).map(q => q.id);
console.log(`questions never asked in any of the ${data.courses.length} ideal runs:`, unused.length ? unused.join(', ') : 'none');
