/* Kuya Carpio's Course Finder - screens and interaction.
 * Needs data.js (window.COURSE_DATA) and engine.js (window.CourseEngine).
 * No libraries, no network calls: everything runs in the visitor's browser. */
(function () {
  'use strict';

  var D = window.COURSE_DATA;
  var E = window.CourseEngine;
  var APP = document.getElementById('app');
  var STORE_KEY = 'urs-course-finder:answers:v1';
  var COLLEGE_ORDER = ['COEng', 'COS', 'COE', 'CIT'];
  var COLLEGE_SHORT = { COEng: 'Engineering', COS: 'Science', COE: 'Education', CIT: 'Industrial Tech' };
  var CATEGORY = { skills: 'SKILLS', interests: 'INTERESTS', personality: 'PERSONALITY', dreams: 'DREAMS', practical: 'REALITY CHECK', values: 'VALUES', strand: 'SENIOR HIGH' };

  var LINES = {
    strand: 'First, tell me where you studied in Senior High.',
    neutral: ['Hmm, interesting!', 'Got it. Let me think...', 'Noted! Next one.', 'The mountains are listening...', 'Okay, I am learning about you.', 'Ooh, good answer.'],
    unsure: ['Not sure? That is okay!', 'No worries, we will see.', 'Hmm, a mystery!'],
    drop: ['Whoa! {n} courses just fell out of the race!', 'Aha! That narrowed it down by {n}!'],
    dropHidden: ['Whoa! That narrowed things down a lot!', 'Aha! That told me something big!'],
    close: ['I think I am onto something...', 'My giant brain is getting excited!'],
    back: 'No problem, let us try that one again.'
  };

  var session = null;
  var screen = 'welcome';
  var currentQ = null;
  var mood = { m: 'thinking', t: '' };
  var timers = [];

  /* ---------------------------------------------------------- helpers */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function $(id) { return document.getElementById(id); }
  function sprite(name) { return 'img/giant_' + name + '.png'; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function show(html, name) {
    clearTimers();
    screen = name;
    APP.innerHTML = html;
    window.scrollTo(0, 0);
  }
  function shortLabel(label) { return label.split(' (')[0]; }
  function collegeName(id) { return D.colleges[id] || id; }
  function newSession() {
    return E.createSession({ traits: D.traits, courses: D.courses, questions: D.questions, strandQuestion: D.strandQuestion });
  }
  function store(fn) { try { return fn(window.localStorage); } catch (e) { return null; } }
  function saveAnswers() { store(function (s) { s.setItem(STORE_KEY, JSON.stringify(session.answers)); }); }
  function loadAnswers() {
    var raw = store(function (s) { return s.getItem(STORE_KEY); });
    if (!raw) return null;
    try { var a = JSON.parse(raw); return Array.isArray(a) && a.length >= 15 ? a : null; } catch (e) { return null; }
  }
  function forgetAnswers() { store(function (s) { s.removeItem(STORE_KEY); }); }

  /* Viewing preferences, remembered on this device only. */
  var PREF_KEY = 'urs-course-finder:prefs:v1';
  var prefs = { hideRace: false, hideOthers: false };
  (function loadPrefs() {
    var raw = store(function (s) { return s.getItem(PREF_KEY); });
    if (!raw) return;
    try { var p = JSON.parse(raw); prefs.hideRace = !!p.hideRace; prefs.hideOthers = !!p.hideOthers; } catch (e) { /* ignore */ }
  })();
  function savePrefs() { store(function (s) { s.setItem(PREF_KEY, JSON.stringify(prefs)); }); }

  /* ---------------------------------------------------------- welcome */
  function showWelcome() {
    session = null;
    var saved = loadAnswers();
    show(
      '<section class="screen hero">' +
        '<img class="hero-scene px" src="img/scene.png" width="784" height="448" alt="Kuya Carpio, a pixel giant, holds two mountains apart">' +
        '<h1>Which ' + esc(D.campus.replace('University of Rizal System - ', 'URS ')) + ' course is meant for you?</h1>' +
        '<p class="lead">Kuya Carpio, the giant who holds the mountains of Rizal apart, will ask about your skills, interests and dreams. Then he will guess the course that fits you best.</p>' +
        '<div class="actions">' +
          '<button class="btn big blue" id="start" type="button">Start the quest</button>' +
          (saved ? '<button class="btn ghost" id="last" type="button">See my last result</button>' : '') +
        '</div>' +
        (saved ? '<p class="small-note">Saved only on this device. <button class="linkish" id="forget" type="button">Forget my saved result</button></p>' : '') +
        '<label class="check" for="hideRacePref"><input type="checkbox" id="hideRacePref"' + (prefs.hideRace ? ' checked' : '') + '>' +
          '<span>Hide the "courses still in the race" list while I answer<small>Handy if you already have a favorite course and do not want it to sway your answers. You can change this during the quiz too.</small></span></label>' +
        '<div class="facts">' +
          '<div class="fact"><b>ABOUT 30 QUESTIONS</b>Takes around 5 to 10 minutes. Answer honestly for the best match.</div>' +
          '<div class="fact"><b>' + D.courses.length + ' PROGRAMS</b>Across the 4 colleges of URS Morong. Watch them drop out as you answer, or hide the list if you prefer.</div>' +
          '<div class="fact"><b>PRIVATE</b>No sign-up. Your answers never leave your device.</div>' +
          '<div class="fact"><b>A GUIDE ONLY</b>Use it to start a conversation with your counselor, not to end it.</div>' +
        '</div>' +
      '</section>', 'welcome');
    $('start').addEventListener('click', startQuiz);
    $('hideRacePref').addEventListener('change', function (ev) { prefs.hideRace = ev.target.checked; savePrefs(); });
    if (saved) {
      $('last').addEventListener('click', function () {
        try {
          session = newSession();
          saved.forEach(function (a) { session.answer(a.qid, a.response); });
          showDashboard(session.results());
        } catch (e) { forgetAnswers(); showWelcome(); }
      });
      $('forget').addEventListener('click', function () { forgetAnswers(); showWelcome(); });
    }
  }

  /* ---------------------------------------------------------- quiz */
  function startQuiz() {
    session = newSession();
    mood = { m: 'idle', t: 'Hello! I am Kuya Carpio. Let us find your course.' };
    var chips = D.courses.slice().sort(function (a, b) {
      return COLLEGE_ORDER.indexOf(a.college) - COLLEGE_ORDER.indexOf(b.college);
    }).map(function (c) {
      return '<li class="chip ' + c.college + '" data-id="' + c.id + '">' + esc(c.short) + '</li>';
    }).join('');
    var legend = COLLEGE_ORDER.map(function (k) {
      return '<span><i style="background:var(--c-' + k + ')"></i>' + esc(COLLEGE_SHORT[k]) + '</span>';
    }).join('');

    show(
      '<section class="screen quiz" aria-label="Quiz">' +
        '<div class="panel">' +
          '<div class="meters">' +
            '<div class="meter-row"><span>QUESTION</span><div class="meter blue"><i id="mq"></i></div><span class="meter-val" id="vq">1</span></div>' +
            '<div class="meter-row"><span>CONFIDENCE</span><div class="meter"><i id="mc"></i></div><span class="meter-val" id="vc">0%</span></div>' +
            '<div class="meter-row" id="rowRace"><span>IN THE RACE</span><div class="meter blue"><i id="mr" style="width:100%"></i></div><span class="meter-val" id="vr">' + D.courses.length + '</span></div>' +
          '</div>' +
          '<div class="stage">' +
            '<div class="mascot" id="mascot"><img class="px" id="mimg" src="' + sprite('idle') + '" alt="Kuya Carpio"></div>' +
            '<div class="bubble"><span class="tag" id="tag"></span><div class="reaction" id="react"></div><div class="qtext" id="qtext" aria-live="polite"></div></div>' +
          '</div>' +
          '<div class="answers" id="answers"></div>' +
          '<div class="quiz-actions"><button class="linkish" id="back" type="button">&larr; Back</button><span class="hint" id="hint"></span></div>' +
        '</div>' +
        '<aside class="panel race" aria-label="Courses still in the race">' +
          '<div class="race-head"><h2>COURSES STILL IN THE RACE</h2>' +
            '<button class="btn small ghost" id="toggleRace" type="button" aria-controls="raceBody" aria-expanded="true">Hide list</button></div>' +
          '<div id="raceBody">' +
            '<span class="count" id="rcount">' + D.courses.length + '</span>' +
            '<ul class="chips" id="chips">' + chips + '</ul>' +
            '<div class="legend">' + legend + '</div>' +
          '</div>' +
          '<p class="race-note" id="raceNote" hidden>The list is hidden so it does not sway your answers. You can show it again any time.</p>' +
        '</aside>' +
      '</section>', 'quiz');

    $('answers').addEventListener('click', onAnswerClick);
    $('back').addEventListener('click', onBack);
    $('toggleRace').addEventListener('click', function () {
      prefs.hideRace = !prefs.hideRace;
      savePrefs();
      applyRaceVisibility();
    });
    applyRaceVisibility();
    nextQuestion();
  }

  /* Hide or show the "still in the race" list (and its count) so it cannot sway answers. */
  function applyRaceVisibility() {
    var hide = prefs.hideRace;
    $('raceBody').hidden = hide;
    $('rowRace').hidden = hide;
    $('raceNote').hidden = !hide;
    var b = $('toggleRace');
    b.textContent = hide ? 'Show list' : 'Hide list';
    b.setAttribute('aria-expanded', hide ? 'false' : 'true');
  }

  function nextQuestion() {
    var q = session.nextQuestion();
    if (!q) return finish();
    currentQ = q;
    paintQuestion(q);
  }

  function paintQuestion(q) {
    var snap = session.snapshot();
    var n = session.questionsAsked();
    var answers = '';
    var cls = '';

    if (q.type === 'statement') {
      cls = ' scale';
      var keyOf = { 1: 1, 0.5: 2, 0: 3, '-0.5': 4, '-1': 5 };
      answers = D.statementScale.map(function (s) {
        var c = s.value === 1 ? 'yes2' : s.value === -1 ? 'no2' : s.value === 0 ? 'unsure' : '';
        return '<button class="ans ' + c + '" type="button" data-v="' + s.value + '"><span class="key">' + keyOf[s.value] + '</span>' + esc(s.label) + '</button>';
      }).join('');
    } else {
      answers = q.options.map(function (o, i) {
        var label = typeof o === 'string' ? o : o.label;
        return '<button class="ans" type="button" data-i="' + i + '"><span class="key">' + (i + 1) + '</span>' + esc(label) + '</button>';
      }).join('');
    }

    var isStrand = q.type === 'strand';
    $('answers').className = 'answers' + cls;
    $('answers').innerHTML = answers;
    $('tag').textContent = isStrand ? CATEGORY.strand : (CATEGORY[q.category] || 'QUESTION');
    $('qtext').textContent = q.text;
    $('react').textContent = mood.t || '';
    $('mimg').src = sprite(mood.m);
    $('hint').textContent = q.type === 'statement' ? 'Tip: press 1 to 5 on your keyboard' : 'Tip: press a number key to choose';
    $('back').style.visibility = session.answers.length ? 'visible' : 'hidden';

    $('mq').style.width = Math.min(100, Math.round((n / 30) * 100)) + '%';
    $('vq').textContent = isStrand ? '-' : String(n + 1);
    $('mc').style.width = Math.round(snap.confidence * 100) + '%';
    $('vc').textContent = Math.round(snap.confidence * 100) + '%';

    var alive = {};
    snap.inRace.forEach(function (id) { alive[id] = true; });
    var chips = document.querySelectorAll('#chips .chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('out', !alive[chips[i].getAttribute('data-id')]);
    }
    $('rcount').textContent = snap.inRace.length;
    $('vr').textContent = snap.inRace.length;
    $('mr').style.width = Math.round((snap.inRace.length / D.courses.length) * 100) + '%';

    if (mood.m === 'surprised' || mood.m === 'gotit') {
      var m = $('mascot');
      m.classList.remove('bounce');
      void m.offsetWidth;
      m.classList.add('bounce');
    }
  }

  function onAnswerClick(ev) {
    var btn = ev.target.closest ? ev.target.closest('.ans') : null;
    if (!btn || !currentQ) return;
    var q = currentQ;
    var response = btn.hasAttribute('data-v') ? parseFloat(btn.getAttribute('data-v')) : parseInt(btn.getAttribute('data-i'), 10);
    var before = session.snapshot();
    session.answer(q.id, response);
    var after = session.snapshot();
    mood = chooseMood(q, response, before, after);
    saveAnswers();
    nextQuestion();
  }

  function chooseMood(q, response, b, a) {
    var drop = b.inRace.length - a.inRace.length;
    if (q.type === 'strand') return { m: 'thinking', t: 'Thanks! Now the real questions.' };
    if (q.type === 'statement' && response === 0) return { m: 'curious', t: pick(LINES.unsure) };
    if (drop >= 3) {
      // when the list is hidden, do not leak how many courses are left
      return { m: 'surprised', t: prefs.hideRace ? pick(LINES.dropHidden) : pick(LINES.drop).replace('{n}', drop) };
    }
    if (a.confidence >= 0.85 && a.asked >= 15) return { m: 'gotit', t: pick(LINES.close) };
    return { m: 'thinking', t: pick(LINES.neutral) };
  }

  function onBack() {
    if (!session || !session.answers.length) return;
    session.undo();
    mood = { m: 'curious', t: LINES.back };
    saveAnswers();
    nextQuestion();
  }

  document.addEventListener('keydown', function (ev) {
    if (screen !== 'quiz' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === 'Backspace') { ev.preventDefault(); onBack(); return; }
    if (/^[1-9]$/.test(ev.key)) {
      var btns = document.querySelectorAll('#answers .ans');
      var b = btns[parseInt(ev.key, 10) - 1];
      if (b) b.click();
    }
  });

  /* ---------------------------------------------------------- finish & reveal */
  function finish() {
    currentQ = null;
    show(
      '<section class="screen center thinking-screen">' +
        '<img class="px" src="' + sprite('push') + '" alt="Kuya Carpio straining while holding two mountains">' +
        '<h2 class="pixel-title" style="font-size:13px;margin-top:14px;color:var(--blue-dark)">Kuya Carpio is checking your answers<span class="dots"></span></h2>' +
      '</section>', 'thinking');
    var res = session.results();
    later(function () { showReveal(res); }, 1900);
  }

  function showReveal(res) {
    var top = res.top3[0];
    var ok = res.reliable;
    var bits = '';
    var colors = ['#f5c842', '#ff6fa3', '#5be37a', '#5b8cff', '#ffffff'];
    for (var i = 0; i < 36; i++) {
      bits += '<i style="left:' + Math.floor(Math.random() * 98) + '%;background:' + colors[i % colors.length] + ';animation-duration:' + (2.2 + Math.random() * 2.2).toFixed(2) + 's;animation-delay:-' + (Math.random() * 4).toFixed(2) + 's"></i>';
    }
    show(
      '<section class="screen center reveal">' +
        (ok ? '<div class="confetti" aria-hidden="true">' + bits + '</div>' : '') +
        '<img class="px sprite" src="' + sprite(ok ? 'celebrate' : 'curious') + '" alt="Kuya Carpio">' +
        '<h2 class="say">' + (ok ? 'I have thought hard about it. I think you should take...' : 'This is only a rough guess, but I would look at...') + '</h2>' +
        '<h1 class="answer">' + esc(top.name) + '</h1>' +
        '<p class="sub">' + esc(top.tagline) + '</p>' +
        '<span class="conf">' + esc(top.fit.toUpperCase()) + ' &middot; FIT SCORE ' + top.match + '</span>' +
        '<div><button class="btn big blue" id="seeDash" type="button">See my full dashboard</button></div>' +
      '</section>', 'reveal');
    $('seeDash').addEventListener('click', function () { showDashboard(res); });
  }

  /* ---------------------------------------------------------- dashboard */
  function radar(items) {
    var W = 400, H = 340, cx = 200, cy = 170, R = 112, n = items.length;
    function pt(i, f) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f];
    }
    function poly(f) { return items.map(function (_, i) { return pt(i, f).map(function (v) { return v.toFixed(1); }).join(','); }).join(' '); }
    var s = '<svg class="radar" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Interest radar chart: ' +
      esc(items.map(function (it) { return it.name + ' ' + it.score; }).join(', ')) + '">';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      s += '<polygon points="' + poly(f) + '" fill="' + (f === 1 ? '#f4f8ff' : 'none') + '" stroke="#9db4ea" stroke-width="' + (f === 1 ? 3 : 1.5) + '"/>';
    });
    items.forEach(function (_, i) {
      var p = pt(i, 1);
      s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="#c4d4f5" stroke-width="1.5"/>';
    });
    var data = items.map(function (it, i) { return pt(i, Math.max(0.04, it.score / 100)).map(function (v) { return v.toFixed(1); }).join(','); }).join(' ');
    s += '<polygon points="' + data + '" fill="rgba(30,79,216,.35)" stroke="#1e4fd8" stroke-width="4" stroke-linejoin="round"/>';
    items.forEach(function (it, i) {
      var p = pt(i, Math.max(0.04, it.score / 100));
      s += '<rect x="' + (p[0] - 5).toFixed(1) + '" y="' + (p[1] - 5).toFixed(1) + '" width="10" height="10" fill="#f5c842" stroke="#0a1433" stroke-width="2"/>';
      var l = pt(i, 1.2);
      var anchor = l[0] < cx - 6 ? 'end' : l[0] > cx + 6 ? 'start' : 'middle';
      s += '<text x="' + l[0].toFixed(1) + '" y="' + (l[1] + 4).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(it.name) + ' ' + it.score + '</text>';
    });
    return s + '</svg>';
  }

  function sbar(label, score, top) {
    return '<div class="sbar' + (top ? ' top' : '') + '"><span>' + (top ? '<span class="star" aria-hidden="true">&#9733;</span> ' : '') + esc(label) + '</span>' +
      '<div class="bar" role="img" aria-label="' + esc(label) + ' ' + score + ' out of 100"><i style="width:' + score + '%"></i></div><span class="n">' + score + '</span></div>';
  }

  function tags(arr, cls, fmt) {
    if (!arr.length) return '';
    return '<ul class="tags ' + (cls || '') + '">' + arr.map(function (x) { return '<li>' + fmt(x) + '</li>'; }).join('') + '</ul>';
  }

  function programDetails(c) {
    return (c.why.length ? '<h4>WHY IT FITS YOU</h4>' + tags(c.why, '', function (w) { return esc(shortLabel(w.label)) + ' ' + w.user; }) : '') +
      (c.gaps.length ? '<h4>COULD GROW</h4>' + tags(c.gaps, 'gap', function (w) { return esc(shortLabel(w.label)); }) : '') +
      '<h4>CAREER PATHS</h4><ul class="plain">' + c.careers.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<p class="small-note"><b>Licensure:</b> ' + esc(c.licensure) + '</p>';
  }

  function showDashboard(res) {
    var top3 = res.top3.map(function (c, i) {
      return '<article class="pcard' + (i === 0 ? ' first' : '') + '">' +
        '<span class="rank">#' + (i + 1) + '</span>' +
        '<span class="college-badge ' + c.college + '">' + esc(c.college) + '</span>' +
        '<h3>' + esc(c.name) + '</h3>' +
        '<div class="fit"><span class="num">' + c.match + '</span><span class="lbl ' + c.fit.split(' ')[0] + '">' + esc(c.fit) + '</span></div>' +
        '<div class="bar" role="img" aria-label="Fit score ' + c.match + ' out of 100"><i style="width:' + c.match + '%"></i></div>' +
        '<p class="tagline">' + esc(c.tagline) + '</p>' +
        programDetails(c) +
      '</article>';
    }).join('');

    var interests = res.interests.map(function (t) { return { name: shortLabel(t.label), score: t.score }; });
    var topSkillIds = {};
    res.bestSkills.forEach(function (s) { topSkillIds[s.id] = true; });
    var skills = res.skills.slice().sort(function (a, b) { return b.score - a.score; })
      .map(function (s) { return sbar(s.label, s.score, !!topSkillIds[s.id]); }).join('');
    var niche = res.niche.length ? '<h3 class="pixel-title" style="font-size:10px;margin:16px 0 8px;color:var(--blue-dark)">SPECIAL INTERESTS</h3>' +
      tags(res.niche, '', function (t) { return esc(t.label) + ' ' + t.score; }) : '';

    var colleges = COLLEGE_ORDER.slice().sort(function (a, b) { return (res.colleges[b] || 0) - (res.colleges[a] || 0); })
      .map(function (k) {
        var v = res.colleges[k] || 0;
        return '<div class="cbar"><span>' + esc(collegeName(k)) + '</span><div class="bar" role="img" aria-label="' + esc(collegeName(k)) + ' best fit ' + v + '"><i style="width:' + v + '%"></i></div><span class="n">' + v + '</span></div>';
      }).join('');

    var all = res.top3.concat(res.others);
    var groups = COLLEGE_ORDER.map(function (k) {
      var list = all.filter(function (c) { return c.college === k; });
      if (!list.length) return '';
      return '<div class="group"><h3><span class="college-badge ' + k + '">' + esc(k) + '</span>' + esc(collegeName(k)) + '</h3>' +
        list.map(function (c) {
          return '<details class="prog"><summary><span class="nm">' + esc(c.name) + '<small>' + esc(c.fit) + '</small></span><span class="score">' + c.match + '</span></summary>' +
            '<div class="more"><p class="tagline">' + esc(c.tagline) + '</p>' + programDetails(c) + '</div></details>';
        }).join('') + '</div>';
    }).join('');

    var warn = res.warnings.map(function (w) { return '<div class="alert" role="status"><b>HEADS UP</b>' + esc(w.text) + '</div>'; }).join('');

    show(
      '<section class="screen dash">' +
        '<div class="dash-head"><h1>Your results</h1>' +
          '<div class="acts"><button class="btn small" id="saveimg" type="button">Save as image</button>' +
          '<button class="btn small ghost" id="print" type="button">Print</button>' +
          '<button class="btn small blue" id="retake" type="button">Retake</button></div></div>' +
        '<p class="small-note">Based on ' + res.questionsAnswered + ' answers. Fit score is a way to compare programs for you. It is not a prediction of grades or success.</p>' +
        warn +
        '<h2 class="section" style="margin-top:34px;margin-bottom:0">Your top 3 courses</h2><div class="top3">' + top3 + '</div>' +
        '<h2 class="section">Where you stand out<small>The gold stars mark your 3 strongest school-subject skills.</small></h2>' +
        '<div class="two"><div class="panel"><h3 class="pixel-title" style="font-size:10px;color:var(--blue-dark)">YOUR INTERESTS</h3>' + radar(interests) + niche + '</div>' +
        '<div class="panel"><h3 class="pixel-title" style="font-size:10px;color:var(--blue-dark);margin-bottom:6px">YOUR SKILLS</h3>' + skills + '</div></div>' +
        '<h2 class="section">Which college suits you<small>The best fit score found in each college.</small></h2>' +
        '<div class="panel">' + colleges + '</div>' +
        '<div class="sec-head"><h2 class="section">All ' + all.length + ' programs<small>Tap a program to see why it fits, careers and licensure.</small></h2>' +
          '<button class="btn small ghost" id="toggleOthers" type="button" aria-controls="othersBody" aria-expanded="true">Hide list</button></div>' +
        '<div id="othersBody">' + groups + '</div>' +
        '<div class="cta"><button class="btn blue" id="retake2" type="button">Take the quest again</button></div>' +
      '</section>', 'dashboard');

    function applyOthers() {
      $('othersBody').hidden = prefs.hideOthers;
      $('toggleOthers').textContent = prefs.hideOthers ? 'Show list' : 'Hide list';
      $('toggleOthers').setAttribute('aria-expanded', prefs.hideOthers ? 'false' : 'true');
    }
    $('toggleOthers').addEventListener('click', function () { prefs.hideOthers = !prefs.hideOthers; savePrefs(); applyOthers(); });
    applyOthers();
    $('retake').addEventListener('click', startQuiz);
    $('retake2').addEventListener('click', startQuiz);
    $('print').addEventListener('click', function () {
      if (prefs.hideOthers) { prefs.hideOthers = false; applyOthers(); }
      var opened = document.querySelectorAll('details.prog');
      for (var i = 0; i < opened.length; i++) opened[i].open = true;
      window.print();
    });
    $('saveimg').addEventListener('click', function () { saveImage(res); });
  }

  /* ---------------------------------------------------------- result card image */
  function wrap(g, text, maxW) {
    var words = text.split(' '), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else { line = t; }
    });
    if (line) lines.push(line);
    return lines;
  }

  function saveImage(res) {
    var img = new Image();
    img.onload = function () {
      var fontsReady = (document.fonts && document.fonts.ready) ? Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 800); })]) : Promise.resolve();
      fontsReady.then(function () { drawCard(res, img); });
    };
    img.onerror = function () { alert('Sorry, the image could not be made. Try the Print button instead.'); };
    img.src = sprite('celebrate');
  }

  function drawCard(res, img) {
    var W = 1080, H = 1350;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.fillStyle = '#1e4fd8'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.06)';
    for (var y = 0; y < H; y += 48) for (var x = ((y / 48) % 2) * 48; x < W; x += 96) g.fillRect(x, y, 48, 48);
    g.fillStyle = '#0a1433'; g.fillRect(60, 68, W - 120, H - 120);
    g.fillStyle = '#eaf2ff'; g.fillRect(60, 60, W - 120, H - 120);
    g.strokeStyle = '#122f8f'; g.lineWidth = 10; g.strokeRect(65, 65, W - 130, H - 130);

    g.fillStyle = '#122f8f';
    g.font = '28px "Press Start 2P", monospace';
    g.fillText('MY URS MORONG', 120, 150);
    g.fillText('COURSE QUEST', 120, 200);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, W - 120 - 240, 88, 240, 300);

    g.fillStyle = '#0a1433';
    g.font = '800 34px Nunito, "Segoe UI", sans-serif';
    g.fillText('Kuya Carpio says my', 120, 290);
    g.fillText('best fits are:', 120, 336);

    var yy = 410, BOX = 196;
    res.top3.forEach(function (p, i) {
      g.fillStyle = i === 0 ? '#fff3b0' : '#ffffff';
      g.fillRect(120, yy, W - 240, BOX);
      g.strokeStyle = i === 0 ? '#c9971c' : '#122f8f'; g.lineWidth = 6; g.strokeRect(120, yy, W - 240, BOX);
      g.fillStyle = '#1e4fd8';
      g.font = '28px "Press Start 2P", monospace';
      g.fillText('#' + (i + 1), 150, yy + 62);
      g.fillStyle = '#0a1433';
      g.font = '800 40px Nunito, "Segoe UI", sans-serif';
      var lines = wrap(g, p.name, W - 240 - 330);
      lines.slice(0, 2).forEach(function (l, k) { g.fillText(l, 260, yy + 62 + k * 48); });
      g.fillStyle = '#4a5a8a';
      g.font = '700 28px Nunito, "Segoe UI", sans-serif';
      g.fillText(p.fit + ' - ' + collegeName(p.college), 260, yy + 170);
      g.fillStyle = '#1e4fd8';
      g.font = '40px "Press Start 2P", monospace';
      g.textAlign = 'right';
      g.fillText(String(p.match), W - 150, yy + 170);
      g.textAlign = 'left';
      yy += BOX + 20;
    });

    g.fillStyle = '#122f8f';
    g.font = '800 30px Nunito, "Segoe UI", sans-serif';
    var skillText = 'My strongest skills: ' + res.bestSkills.map(function (s) { return shortLabel(s.label); }).join(', ');
    wrap(g, skillText, W - 240).slice(0, 2).forEach(function (l, k) { g.fillText(l, 120, yy + 36 + k * 40); });
    g.fillStyle = '#4a5a8a';
    g.font = '700 24px Nunito, "Segoe UI", sans-serif';
    g.fillText('A guide, not a final decision. Talk to your guidance counselor.', 120, H - 120);

    try {
      c.toBlob(function (blob) {
        if (!blob) { alert('Sorry, the image could not be saved here. Try the Print button instead.'); return; }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'my-urs-morong-course-result.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      }, 'image/png');
    } catch (e) {
      alert('Saving as an image only works when the site is opened from its web address. Try the Print button instead.');
    }
  }

  /* ---------------------------------------------------------- boot */
  $('brand').addEventListener('click', function () {
    if (screen === 'quiz' && session && session.answers.length > 3 && !window.confirm('Leave the quiz? Your answers so far will be lost.')) return;
    showWelcome();
  });

  if (!D || !E) {
    APP.innerHTML = '<p class="noscript">Something went wrong loading the quiz data. Please reload the page.</p>';
  } else {
    showWelcome();
  }
})();
