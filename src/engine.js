/*
 * URS Morong Course Finder - scoring and adaptive question engine.
 *
 * Plain JavaScript with no dependencies. Works in the browser (window.CourseEngine)
 * and in Node (require('./engine.js')), so the same file runs on GitHub Pages
 * and in the test scripts.
 *
 * How it works
 *   1. Every answer adds evidence to one or more TRAITS (see data/traits.json).
 *   2. Evidence becomes a 0-1 score per trait, plus a confidence for that trait.
 *   3. Each course has a profile (0-5 per trait). A course MATCH is how well the
 *      student's traits cover what the course needs. Falling short costs more than
 *      having extra, and traits with little evidence count less.
 *   4. Match scores become probabilities (softmax). "Confidence" is how much of
 *      that probability sits in the top 3 courses.
 *   5. The next question is the one that best splits the courses that are still
 *      in the race (highest entropy of the predicted answers).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CourseEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    minQuestions: 25,        // never reveal before this many (not counting the strand question)
    maxQuestions: 36,        // hard stop
    stopConfidence: 0.9,     // top-3 probability mass needed to stop early
    temperature: 0.03,       // softmax sharpness
    nicheBoost: 2.0,         // extra weight on a course's defining niche traits
    excessFactor: 0.6,       // penalty for being above what a course needs, relative to falling short
    strandWeight: 0.04,      // max nudge from the SHS strand
    evidenceFull: 1.5,       // evidence needed before a trait counts fully
    evidenceShrink: 1.0,     // evidence needed before a trait score is trusted fully
    scenarioStrength: 0.7,   // scenario answers count a bit less than direct statements
    raceRatio: 0.08,         // a course stays "in the race" while its probability is at least this fraction of the leader's
    uncertaintyTemp: 0.25,   // extra softmax temperature while we still know little
    coverageWeight: 0.3,     // bonus for questions about traits we know little about
    sameCategoryPenalty: 0.15
  };

  const STRANDS = ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL'];
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // ---------------------------------------------------------------- evidence
  function accumulate(qmap, answers, cfg) {
    const sum = {}, w = {};
    let strand = -1;
    for (const a of answers) {
      if (a.qid === 'strand') {
        strand = a.response >= 0 && a.response < STRANDS.length ? a.response : -1;
        continue;
      }
      const q = qmap[a.qid];
      if (!q) continue;
      if (q.type === 'statement') {
        for (const t in q.effects) {
          const wt = q.effects[t];
          sum[t] = (sum[t] || 0) + wt * a.response;
          w[t] = (w[t] || 0) + Math.abs(wt);
        }
      } else {
        const touched = new Set();
        q.options.forEach(o => Object.keys(o.effects).forEach(t => touched.add(t)));
        const chosen = q.options[a.response];
        touched.forEach(t => {
          let wm = 0;
          q.options.forEach(o => { wm = Math.max(wm, o.effects[t] || 0); });
          const wc = chosen.effects[t] || 0;
          const v = (2 * wc / wm - 1) * cfg.scenarioStrength;   // -0.7 .. +0.7
          sum[t] = (sum[t] || 0) + wm * v;
          w[t] = (w[t] || 0) + wm * cfg.scenarioStrength;
        });
      }
    }
    return { sum, w, strand };
  }

  function traitEstimates(traitIds, ev, cfg) {
    const u = {}, conf = {};
    for (const t of traitIds) {
      const wt = ev.w[t] || 0;
      const ratio = wt > 0 ? ev.sum[t] / wt : 0;                    // -1 .. +1
      const shrink = Math.min(1, wt / cfg.evidenceShrink);
      u[t] = clamp(0.5 + 0.5 * ratio * shrink, 0, 1);
      conf[t] = Math.min(1, wt / cfg.evidenceFull);
    }
    return { u, conf };
  }

  // ------------------------------------------------------------------- match
  // Weighted distance between the student's traits and the course profile.
  //   - Traits the course needs count more (0.25 .. 2.0), and a course's defining
  //     niche traits (animals, vehicles, kids...) count extra, so they can decide ties.
  //   - Falling short is penalized fully; being far above the need is penalized a
  //     little less (excessFactor), so an Engineering-level student still prefers
  //     Engineering over a Technology course that asks for less.
  //   - A trait counts only as much as we have evidence for it (conf).
  function courseMatch(course, traitIds, est, strand, cfg, groupOf) {
    let num = 0, den = 0;
    const parts = {};
    for (const t of traitIds) {
      const req = (course.profile[t] || 0) / 5;
      let w = 0.25 + 1.75 * req;
      if (req >= 0.6 && groupOf[t] === 'niche') w *= cfg.nicheBoost;
      w *= est.conf[t];
      if (w <= 0) continue;
      const u = est.u[t];
      const diff = u - req;
      const loss = diff < 0 ? diff * diff : cfg.excessFactor * diff * diff;
      num += w * loss;
      den += w;
      parts[t] = { req, u, imp: w, f: 1 - Math.sqrt(loss) };
    }
    let m = den > 0 ? 1 - Math.sqrt(num / den) : 0.5;
    if (strand >= 0 && course.strand) m += cfg.strandWeight * (2 * course.strand[strand] - 1);
    return { match: m, parts };
  }

  function softmax(values, temp) {
    const mx = Math.max(...values);
    const ex = values.map(v => Math.exp((v - mx) / temp));
    const s = ex.reduce((a, b) => a + b, 0);
    return ex.map(e => e / s);
  }

  // ------------------------------------------------------- next-question pick
  const g = r => Math.max(-0.3, 2 * r - 1);   // how a course "feels" about a trait: need -> +1, no need -> -0.3

  function predictedBin(q, course) {
    if (q.type === 'statement') {
      let s = 0, d = 0;
      for (const t in q.effects) {
        s += q.effects[t] * g((course.profile[t] || 0) / 5);
        d += Math.abs(q.effects[t]);
      }
      return Math.round(2 * (s / d));            // -2 .. 2
    }
    let best = 0, bestScore = -Infinity;
    q.options.forEach((o, i) => {
      let s = 0;
      for (const t in o.effects) s += o.effects[t] * g((course.profile[t] || 0) / 5);
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return best;
  }

  function questionTraits(q) {
    const m = {};
    const add = (t, w) => { m[t] = Math.max(m[t] || 0, w); };
    if (q.type === 'statement') for (const t in q.effects) add(t, q.effects[t]);
    else q.options.forEach(o => { for (const t in o.effects) add(t, o.effects[t]); });
    return m;
  }

  function infoScore(q, courses, p, est, lastCategory, cfg) {
    const bins = {};
    courses.forEach((c, i) => {
      const k = predictedBin(q, c);
      bins[k] = (bins[k] || 0) + p[i];
    });
    let entropy = 0;
    for (const k in bins) if (bins[k] > 0) entropy -= bins[k] * Math.log(bins[k]);
    const tw = questionTraits(q);
    let tot = 0, need = 0;
    for (const t in tw) { tot += tw[t]; need += tw[t] * (1 - est.conf[t]); }
    const coverage = tot > 0 ? need / tot : 0;
    return entropy + cfg.coverageWeight * coverage - (q.category === lastCategory ? cfg.sameCategoryPenalty : 0);
  }

  // ----------------------------------------------------------------- session
  function createSession(data, config) {
    const cfg = Object.assign({}, DEFAULTS, config || {});
    const traitIds = data.traits.map(t => t.id);
    const traitMeta = {};
    const groupOf = {};
    data.traits.forEach(t => { traitMeta[t.id] = t; groupOf[t.id] = t.group; });
    const courses = data.courses;
    const qmap = {};
    data.questions.forEach(q => { qmap[q.id] = q; });
    const answers = [];

    function evaluate() {
      const ev = accumulate(qmap, answers, cfg);
      const est = traitEstimates(traitIds, ev, cfg);
      const scored = courses.map(c => {
        const r = courseMatch(c, traitIds, est, ev.strand, cfg, groupOf);
        return { course: c, match: r.match, parts: r.parts };
      });
      // How much do we know overall? Early on the distribution stays flat (everyone is
      // "still in the race"); as evidence builds it sharpens. This gives the Akinator feel
      // and stops a single answer from looking like certainty.
      const coverage = traitIds.reduce((a, t) => a + est.conf[t], 0) / traitIds.length;
      const temp = cfg.temperature + cfg.uncertaintyTemp * Math.pow(1 - coverage, 2);
      const p = softmax(scored.map(s => s.match), temp);
      scored.forEach((s, i) => { s.p = p[i]; });
      const ranked = scored.slice().sort((a, b) => b.match - a.match);
      const top3Mass = ranked.slice(0, 3).reduce((a, s) => a + s.p, 0);
      const pmax = ranked[0].p;
      let race = ranked.filter(s => s.p >= cfg.raceRatio * pmax);
      if (race.length < 3) race = ranked.slice(0, 3);       // never show fewer than 3 contenders
      const inRace = race.map(s => s.course.id);
      return { ev, est, scored, ranked, p, confidence: top3Mass, coverage, inRace };
    }

    function asked() { return answers.filter(a => a.qid !== 'strand').length; }
    function hasStrand() { return answers.some(a => a.qid === 'strand'); }

    function isDone() {
      const n = asked();
      if (n >= cfg.maxQuestions) return true;
      if (n >= cfg.minQuestions && evaluate().confidence >= cfg.stopConfidence) return true;
      return n >= data.questions.length;
    }

    return {
      config: cfg,
      answers,

      /** Returns the next question object, or null when the Giant is ready to reveal. */
      nextQuestion() {
        if (!hasStrand() && data.strandQuestion) {
          return Object.assign({ type: 'strand' }, data.strandQuestion);
        }
        if (isDone()) return null;
        const state = evaluate();
        const done = new Set(answers.map(a => a.qid));
        const last = answers.length ? (qmap[answers[answers.length - 1].qid] || {}).category : null;
        let best = null, bestScore = -Infinity;
        for (const q of data.questions) {
          if (done.has(q.id)) continue;
          const s = infoScore(q, courses, state.p, state.est, last, cfg);
          if (s > bestScore) { bestScore = s; best = q; }
        }
        return best;
      },

      /** statement -> one of -1, -0.5, 0, 0.5, 1; scenario/strand -> option index */
      answer(qid, response) {
        answers.push({ qid, response });
      },

      undo() { return answers.pop(); },

      isDone,
      questionsAsked: asked,

      /** Live numbers for the Akinator-style screen. */
      snapshot() {
        const s = evaluate();
        return {
          asked: asked(),
          confidence: s.confidence,
          inRace: s.inRace,
          leaders: s.ranked.slice(0, 3).map(x => ({ id: x.course.id, match: x.match, p: x.p })),
          traits: Object.fromEntries(traitIds.map(t => [t, { score: s.est.u[t], confidence: s.est.conf[t] }]))
        };
      },

      /** Everything the dashboard needs. */
      results() {
        const s = evaluate();
        // "Fit score": a comparison index, NOT a probability or a prediction of success.
        const pct = m => Math.round(100 * clamp((m - 0.25) / 0.7, 0, 1));
        const fitLabel = v => (v >= 75 ? 'Strong fit' : v >= 55 ? 'Good fit' : 'Possible fit');
        const label = t => traitMeta[t].label;
        const detail = (x) => {
          const why = [], gaps = [];
          for (const t in x.parts) {
            const pt = x.parts[t];
            if (pt.req >= 0.6 && pt.u >= 0.6 && s.est.conf[t] >= 0.4) why.push({ trait: t, label: label(t), user: Math.round(pt.u * 100), need: Math.round(pt.req * 100) });
            if (pt.req >= 0.6 && pt.u < 0.4 && s.est.conf[t] >= 0.4) gaps.push({ trait: t, label: label(t), user: Math.round(pt.u * 100), need: Math.round(pt.req * 100) });
          }
          why.sort((a, b) => b.user * b.need - a.user * a.need);
          gaps.sort((a, b) => (b.need - b.user) - (a.need - a.user));
          return {
            id: x.course.id, name: x.course.name, short: x.course.short, college: x.course.college,
            tagline: x.course.tagline, careers: x.course.careers, licensure: x.course.licensure,
            match: pct(x.match), fit: fitLabel(pct(x.match)), rawMatch: x.match,
            why: why.slice(0, 4), gaps: gaps.slice(0, 3)
          };
        };
        const all = s.ranked.map(detail);
        const byGroup = grp => data.traits.filter(t => t.group === grp).map(t => ({
          id: t.id, label: t.label, score: Math.round(s.est.u[t.id] * 100), confidence: Math.round(s.est.conf[t.id] * 100)
        }));
        const colleges = {};
        all.forEach(c => {
          const e = colleges[c.college] || (colleges[c.college] = { best: 0, scores: [] });
          e.best = Math.max(e.best, c.match);
          e.scores.push(c.match);
        });
        const interests = byGroup('interest'), skills = byGroup('skill');

        // Warnings for answer patterns that cannot tell courses apart. The confidence meter says
        // how settled the ranking is, not whether the answers were informative, so check that too.
        const known = traitIds.filter(t => s.est.conf[t] >= 0.3);
        const signal = known.length ? known.reduce((a, t) => a + Math.abs(2 * s.est.u[t] - 1), 0) / known.length : 0;
        const meanU = known.length ? known.reduce((a, t) => a + s.est.u[t], 0) / known.length : 0.5;
        const stmts = answers.filter(a => qmap[a.qid] && qmap[a.qid].type === 'statement');
        const notSureRate = stmts.length ? stmts.filter(a => a.response === 0).length / stmts.length : 0;
        const yesRate = stmts.length ? stmts.filter(a => a.response > 0).length / stmts.length : 0;
        const warnings = [];
        if (stmts.length >= 10 && (notSureRate >= 0.65 || signal < 0.15)) warnings.push({ code: 'unsure', text: 'Many of your answers were "Not sure" or in the middle, so these results are only a rough guess. Try again and pick the answer closest to you, even if it is not perfect.' });
        if (stmts.length >= 10 && (yesRate >= 0.85 || meanU > 0.8)) warnings.push({ code: 'all-yes', text: 'You said yes to almost everything, so it is hard to tell the courses apart. Try again and say "No" to things that are not really like you.' });
        if (all[0].match < 50) warnings.push({ code: 'weak', text: 'None of the courses was a strong match for your answers. Consider retaking the test or talking to a guidance counselor.' });
        const niche = byGroup('niche').filter(t => t.score >= 60 && t.confidence >= 50).sort((a, b) => b.score - a.score).slice(0, 3);
        return {
          questionsAnswered: asked(),
          confidence: Math.round(s.confidence * 100),
          warnings,
          reliable: warnings.length === 0,
          top3: all.slice(0, 3),
          others: all.slice(3),
          skills, interests, niche,
          bestSkills: skills.slice().sort((a, b) => b.score - a.score).slice(0, 3),
          bestInterests: interests.slice().sort((a, b) => b.score - a.score).slice(0, 3),
          colleges: Object.fromEntries(Object.entries(colleges).map(([k, v]) => [k, v.best]))
        };
      }
    };
  }

  return { createSession, DEFAULTS, STRANDS };
});
