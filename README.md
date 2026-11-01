# Kuya Carpio's Course Finder - URS Morong (v0.3)

An Akinator-style course recommender for Senior High School students applying to
University of Rizal System - Morong Campus. A pixel giant inspired by the Bernardo Carpio legend
asks about skills, interests and dreams, shows which programs are "still in the race", then reveals a
best-fit program and a results dashboard.

It is a **static website**: plain HTML, CSS and JavaScript. No server, no database, no libraries,
no cost. Answers never leave the visitor's device.

## Folder map

| Path | What it is |
|---|---|
| `docs/` | **The website.** This is what you publish. `index.html`, `css/`, `js/`, `img/` (pixel mascot) |
| `data/traits.json` | The 21 traits measured (6 interests, 6 skills, 9 niche) |
| `data/courses.json` | The 26 programs: trait profile (0-5), careers, licensure note, SHS strand fit |
| `data/questions.json` | 64 questions (statements and scenarios) plus the SHS strand question |
| `src/engine.js` | Scoring, next-question picker, confidence meter, dashboard data |
| `tools/build.js` | Bundles `data/` + the engine into `docs/js/` and checks the data for typos |
| `tools/make_background.py` | Draws the pixel sky, clouds and twin-peak mountains behind the site (`docs/img/bg-*.png`) |
| `tests/run_personas.js` | Simulated students that test the scoring |
| `tests/responsive_test.js` | Optional: opens the site at 10 screen sizes and checks the layout and toggles (needs `npm i playwright`) |

## Features added in v0.3

- **Pixel scenery background** instead of the checkerboard: a sky gradient, slowly drifting clouds, and two layers of
  mountains with a twin-peak pair in the middle (a nod to Pamitinan and Binacayan). On phones it is drawn smaller so it
  does not take over the screen. The clouds stop moving for people who have "reduce motion" turned on.
  To change it, edit the colors or peaks in `tools/make_background.py` and run `python3 tools/make_background.py`.
- **Hide/show the "courses still in the race" list**, so students can answer without being swayed by a favorite course.
  There is a checkbox on the start screen and a **Hide list / Show list** button in the quiz. While hidden, the
  count meter is hidden too and Kuya Carpio's reactions never mention how many courses are left.
  The choice is remembered on that device only.
- **Hide/show the full program list on the results dashboard** (the "All 26 programs" section), same idea.
- **Responsive on every size:** tested at 320, 360, 390 and 412 px phones, 768 and 820 px tablets (portrait),
  a 1024 px tablet (landscape), 1280 and 1366 px laptops, and a 1920 px desktop.

## Try it on your computer

1. Double-click `docs/index.html`. It works straight from the file.
   (Only "Save as image" needs the real website address; "Print" works everywhere.)
2. After you edit anything in `data/` or `src/engine.js`, run `node tools/build.js` and refresh.

## Put it online free with GitHub Pages

1. Create a **public** GitHub repository and upload this whole folder.
2. In the repo go to **Settings > Pages**, set Source to "Deploy from a branch", choose branch `main` and folder `/docs`, then Save.
3. After a minute your site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

About "hiding the code": any website sends its code to the visitor's browser, so it can always be read.
There is nothing secret in this project, and there is no server or login to hack. Only you can change the
published version, so turn on two-factor login for your GitHub account, and add a `LICENSE` file
(for example "all rights reserved, credit required") to protect your work.

## How it works

1. **Answers add evidence to traits.** "I enjoy solving math problems" feeds Math and Analytical.
2. **Each trait becomes a 0-100 score** plus a confidence (how much evidence we have).
3. **Each program has a profile** (0-5 per trait). The *fit score* is the weighted distance between the student
   and that profile. Falling short costs more than being above, and a program's defining traits
   (for example Animals for Animal Biology) count extra.
4. **Akinator behavior:** the next question is the one that best splits the programs still in the race.
   Early on every program is alive, and the list narrows as evidence builds (never fewer than 3).
5. **Length:** at least 25 and at most 36 questions, stopping early when the top 3 are settled.
6. **Honest warnings:** if answers are mostly "Not sure", mostly "Yes", or nothing fits well, the
   results say so instead of pretending.

## Test results

All of these are simulated or scripted students, not real people.

| Test | Result |
|---|---|
| Ideal student for each program (engine only) | #1 for 26 of 26, top 3 for 26 of 26 |
| Same, through the real website in a browser (phone size) | right program on the reveal screen for 26 of 26 |
| Noisy students (random wobble on every trait, 20 per program) | #1 in 89%, top 3 in 99% |
| Average questions asked | about 30 (range 25 to 36) |
| Race narrowing (Computer Science student) | 26 programs, then 16 after 3 questions, 11 after 5, 3 after 10 |
| Bad input ("Not sure" / "Yes" / "No" to everything) | each gets the right warning; no typical student is wrongly warned |
| `file://` (double-click) and `http://` | both run with no errors |
| 10 screen sizes (phones, tablets, laptops, desktop), every screen | no sideways scrolling; hide/show toggles work; no script errors |

**Honest limits:** the simulated students come from the same profiles the engine uses, so these tests prove the
machinery works, not that the profiles are right. Weakest spots: the look-alike engineering programs
(Electrical, Electronics and Communications, Computer), where the exact #1 is right only 45 to 85% of the time
under noise, though the right program is nearly always in the top 3. Because Senior High strand adds a small
nudge, a student from an unusual strand for their program can see a neighbor program first.

## Things YOU need to verify before publishing

1. **Program list and names** against the current URS Morong prospectus or admissions office.
   (BS Guidance and Counseling has been removed, as you asked.)
2. **Licensure and career notes** in `courses.json`, which say "verify" where I was not sure.
3. **The profile numbers (0-5) are my estimates, not official data.** To make them truly accurate:
   - ask a few URS Morong faculty or guidance staff to review each profile
   - have 20 to 30 students (ideally current URS students per program) take the quiz and check whether
     their own program lands in their top 3
   - adjust `courses.json`, run `node tools/build.js`, and re-run the tests
4. **SHS strand fit** (`strand`: STEM, ABM, HUMSS, GAS, TVL) is a small nudge only.
5. **Mascot:** it is an original design, not the official URS mascot. If you get permission to use the
   official artwork, swap the PNGs in `docs/img/` (same names).
6. **Fonts:** the pixel font loads from Google Fonts when online. Offline it falls back to a plain monospace font.

## Editing without code (admin, v1)

Questions, programs and weights are plain JSON in `data/`. Edit them (GitHub's web editor works), run
`node tools/build.js`, and publish. A local-only `admin.html` form tool can come later.

## Tuning knobs (`src/engine.js`, `DEFAULTS`)

`minQuestions`, `maxQuestions`, `stopConfidence`, `nicheBoost`, `excessFactor`, `temperature`, `raceRatio`.
Change one at a time and re-run `node tests/run_personas.js`.

## Next steps

1. Review the data with URS Morong faculty or guidance staff and a small group of students.
2. "Compare two programs" view, especially for the look-alike engineering programs.
3. Local admin tool for editing questions and profiles.
4. Optional: sound effects with a mute button; self-hosted pixel font.
