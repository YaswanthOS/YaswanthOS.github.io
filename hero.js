// Hero tactical sequence, in two acts.
//
// Act 1 (the football), now five sequenced beats instead of a continuous
// run-then-pass:
//   0. The mark — a gold arrow from D1 to A3, held alone (formation
//      otherwise static) so it actually registers, then fades out as
//      beat 1 begins.
//   1. The run — A2 draws the Bézier; D1 reacts partway through and drifts
//      off A3's zone to track him instead.
//   2. Free — once D1 has fully drifted, the highlight ring on A3 pulses
//      once on its own: the direct answer to "he's unmarked now."
//   3. The pass — a dashed lane + travelling ball from A1 to A3.
//   4. Arrival — the same highlight ring pulses again as the ball lands.
// Fully resolved before anything else happens.
//
// Act 2 (the replay, unchanged from prior rounds): only once Act 1 has
// settled, the SVG's own viewBox zooms into just the run and the
// defender's resolved mark, the rest of the scene fades away, and the
// run's underlying degree-5 Bézier construction — its 6 control points and
// the dashed polygon connecting them — fades in as the sequence's final
// resting state. This is the thesis of the site (the football story
// resolving into its data representation), so it does not zoom back out.
//
// Every animated element ships in the markup already at Act 1's FINAL
// resolved position/state (run drawn, dot arrived, defender pulled wide,
// pass drawn, ball at A3, highlight settled, marking-arrow gone, control
// rings/polygon hidden). That is deliberate: if prefers-reduced-motion is
// set, the CSS media query in styles.css (!important) forces the
// trajectory's final state on its own, and everything else needs no
// override at all because its default already IS Act 1's final state —
// this script simply resets every animated piece to its starting mark, in
// one synchronous setup pass, and steps aside entirely when motion is
// reduced. Act 2 never runs for reduced motion: it's a motion-only
// transition layered on top of an already-complete Act 1, not a second
// static state, so the control rings/polygon stay hidden and the viewBox
// stays full-pitch. No flash, no JS dependency for the resolved view.
(function () {
  "use strict";

  var svg = document.querySelector(".hero-pitch");
  var runPath = document.querySelector(".trajectory");
  var runner = document.querySelector(".runner");
  var defender = document.querySelector(".drift");
  var markingArrow = document.querySelector(".marking-arrow");
  var passPath = document.querySelector(".pass-reveal-path");
  var passLane = document.querySelector(".pass-lane");
  var ball = document.querySelector(".ball");
  var highlight = document.querySelector(".pass-highlight");
  var endMark = document.querySelector(".end-mark");
  var controlDots = document.querySelectorAll(".control-dot");
  var controlPolygon = document.querySelector(".control-polygon");

  if (
    !svg ||
    !runPath ||
    !runner ||
    !defender ||
    !markingArrow ||
    !passPath ||
    !passLane ||
    !ball ||
    !highlight ||
    !endMark ||
    !controlDots.length ||
    !controlPolygon
  ) {
    return;
  }

  var reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (reduceMotion) return;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }

  function setBall(x, y) {
    ball.setAttribute("transform", "translate(" + x + "," + y + ")");
  }

  // --- Setup: hide/reset every animated piece before anything is drawn ---
  // Done synchronously, all at once, so nothing sits at its default final
  // state (arrived runner, drifted defender, drawn pass, ball at A3,
  // settled highlight) even for a frame before Act 1 takes over.

  var runLength = runPath.getTotalLength();
  var runStart = runPath.getPointAtLength(0);
  runPath.style.strokeDasharray = runLength;
  runPath.style.strokeDashoffset = runLength;
  runner.setAttribute("cx", runStart.x);
  runner.setAttribute("cy", runStart.y);

  // D1's chase path: a quadratic Bézier (not a straight lerp to a fixed
  // point) so he visibly shadows the runner's own curve instead of just
  // drifting to an unrelated spot — that mismatch was exactly why the
  // chase didn't read as a chase. Start is D1's own mark; the control
  // point dips wide/deep first, echoing the run's own early bulge, so the
  // two paths visually rhyme; the end point sits ~70 units behind and
  // below the runner's finish (1030,360) — close enough that D1 is
  // plainly still hunting him, not close enough to suggest he catches him.
  // Read from the markup's shipped default so there's one source of truth
  // with the HTML (same convention as before), not a second hard-coded copy.
  var defenderEnd = {
    x: parseFloat(defender.getAttribute("cx")),
    y: parseFloat(defender.getAttribute("cy")),
  };
  var defenderStart = { x: 840, y: 420 };
  var defenderControl = { x: 870, y: 480 };
  defender.setAttribute("cx", defenderStart.x);
  defender.setAttribute("cy", defenderStart.y);

  function quadraticBezier(p0, p1, p2, t) {
    var mt = 1 - t;
    return {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    };
  }

  var ballStart = { x: 620, y: 380 }; // A1, holding it
  var ballEnd = { x: 830, y: 390 }; // A3, on arrival
  setBall(ballStart.x, ballStart.y);

  var passLength = passPath.getTotalLength();
  passPath.style.strokeDasharray = passLength;
  passPath.style.strokeDashoffset = passLength;
  highlight.classList.add("pre-pulse");

  endMark.style.opacity = 0;

  // The mark arrow is hidden until beat 0 explicitly fades it in — it has
  // no business being visible before the sequence starts.
  markingArrow.style.opacity = 0;

  controlDots.forEach(function (dot) {
    dot.style.opacity = 0;
  });
  controlPolygon.style.opacity = 0;

  // --- Act 1, beat 0: the mark ---
  // A gold arrow, D1 → A3, held alone (nothing else moving) long enough to
  // actually register, then faded out as the run begins. This is the
  // beat that makes the tactical idea legible before any motion competes
  // for attention: D1 is marking A3, not the runner.

  var arrowFadeInDuration = 300; // ms
  var arrowHoldDuration = 1400; // ms — long enough to read before anything else moves
  var arrowFadeOutDuration = 350; // ms — overlaps the very start of beat 1, doesn't block it

  function startMarkBeat() {
    markingArrow.style.transition = "opacity " + arrowFadeInDuration + "ms ease";
    // rAF so the transition is actually picked up rather than coalesced
    // with the synchronous opacity:0 set above.
    requestAnimationFrame(function () {
      markingArrow.style.opacity = 1;
    });

    setTimeout(function () {
      markingArrow.style.transition = "opacity " + arrowFadeOutDuration + "ms ease";
      markingArrow.style.opacity = 0;
      // Beat 1 starts as the arrow begins fading, not after it finishes —
      // it's context-setting, not something that needs to fully clear
      // before the run can begin.
      requestAnimationFrame(stepRun);
    }, arrowFadeInDuration + arrowHoldDuration);
  }

  // --- Act 1, beat 1: the run, with the marking defender tracking it ---
  // Slowed down further per feedback ("half the speed as now") — roughly
  // double the previous 2600ms.

  var runDuration = 5200; // ms
  // The defender doesn't react instantly — he tracks the run once it's
  // clearly underway, then closes most of the gap by the time it ends.
  // Unchanged threshold from earlier rounds.
  var defenderReactAt = 0.15; // fraction of run progress before D1 moves at all
  var holdAfterRun = 1100; // ms — end-mark fades in before the "free" pulse fires
  var runStartTime = null;

  function stepRun(timestamp) {
    if (runStartTime === null) runStartTime = timestamp;
    var progress = Math.min((timestamp - runStartTime) / runDuration, 1);
    var eased = easeOutCubic(progress);

    runPath.style.strokeDashoffset = runLength * (1 - eased);
    var point = runPath.getPointAtLength(runLength * eased);
    runner.setAttribute("cx", point.x);
    runner.setAttribute("cy", point.y);

    var defenderProgress = clamp01(
      (progress - defenderReactAt) / (1 - defenderReactAt)
    );
    var defenderEased = easeOutCubic(defenderProgress);
    var defenderPoint = quadraticBezier(defenderStart, defenderControl, defenderEnd, defenderEased);
    defender.setAttribute("cx", defenderPoint.x);
    defender.setAttribute("cy", defenderPoint.y);

    if (progress < 1) {
      requestAnimationFrame(stepRun);
    } else {
      endMark.style.transition = "opacity 400ms ease";
      endMark.style.opacity = 1;
      setTimeout(playFreePulse, holdAfterRun);
    }
  }

  startMarkBeat();

  // --- Act 1, beat 2: "free" — A3 is unmarked now that D1 has fully
  // drifted off him. The highlight ring fires once, on its own, before
  // the pass even starts, as the direct visual answer to "the initial
  // player being free to receive the pass." ---

  var pulseDuration = 600; // ms — matches the 0.6s pass-pulse CSS animation
  var freePulseGap = 350; // ms — brief beat between "free" settling and the pass starting

  // Reused for both the "free" pulse and the arrival pulse: remove + force
  // a reflow + re-add, so the CSS animation actually restarts the second
  // time rather than being a no-op because the class never left.
  // getBoundingClientRect (not offsetWidth — undefined on SVGElement in
  // Firefox, so it wouldn't force anything there) is defined on Element
  // itself, so it forces the reflow on every engine.
  function firePulse(onDone) {
    highlight.classList.remove("pulse");
    void highlight.getBoundingClientRect();
    highlight.classList.add("pulse");
    if (onDone) setTimeout(onDone, pulseDuration);
  }

  function playFreePulse() {
    highlight.classList.remove("pre-pulse");
    firePulse(function () {
      setTimeout(startPass, freePulseGap);
    });
  }

  // --- Act 1, beats 3–4: the payoff — a dashed pass, ball and all, into
  // the space D1 just left, then a second pulse on arrival reusing the
  // same ring (open → received). ---

  function startPass() {
    var passDuration = 2000; // ms
    var passStartTime = null;

    function stepPass(timestamp) {
      if (passStartTime === null) passStartTime = timestamp;
      var progress = Math.min((timestamp - passStartTime) / passDuration, 1);
      var eased = easeOutCubic(progress);
      passPath.style.strokeDashoffset = passLength * (1 - eased);

      // The ball travels the identical "d" as the dashed reveal, in sync
      // with it (same getPointAtLength technique used for the runner
      // above), so it arrives exactly as the pass finishes drawing.
      var point = passPath.getPointAtLength(passLength * eased);
      setBall(point.x, point.y);

      if (progress < 1) {
        requestAnimationFrame(stepPass);
      } else {
        setBall(ballEnd.x, ballEnd.y);
        firePulse(); // arrival — same ring, same animation, fired again
        // Hold on the fully resolved football scene — comfortably longer
        // than the 0.6s pulse animation above, so Act 2 never starts while
        // the pulse is still mid-flight — before Act 2 begins.
        setTimeout(startAct2, 1400);
      }
    }

    requestAnimationFrame(stepPass);
  }

  // --- Act 2: zoom into the run, fade everything else away, reveal the
  // Bézier construction. Final resting state — no zoom back out. ---

  function animateViewBox(from, to, duration, onDone) {
    var startTime = null;

    function step(timestamp) {
      if (startTime === null) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = easeOutCubic(progress);
      var x = lerp(from.x, to.x, eased);
      var y = lerp(from.y, to.y, eased);
      var w = lerp(from.w, to.w, eased);
      var h = lerp(from.h, to.h, eased);
      svg.setAttribute("viewBox", x + " " + y + " " + w + " " + h);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else if (onDone) {
        onDone();
      }
    }

    requestAnimationFrame(step);
  }

  function startAct2() {
    var zoomDuration = 1100; // ms
    var fadeOutDuration = 500; // ms, timed to land as the zoom completes
    var holdDuration = 400; // ms
    var fadeInDuration = 700; // ms

    // Target box keeps the SVG's native 1200:700 (12:7) aspect ratio, so
    // preserveAspectRatio="slice" crops it exactly the same way it crops
    // the full pitch at any container width — no extra clipping introduced
    // by the zoom itself. It frames the run (x:800–1030, y:360–500), D1's
    // resolved mark (930,350), and — since this is the sequence's final
    // resting state, with no zoom back out — all 6 control points down to
    // (830,520) too, so nothing in the closing beat sits outside the
    // frame. Centred on that combined bounding box's centre (915,435).
    var fromBox = { x: 0, y: 0, w: 1200, h: 700 };
    var toBox = { x: 705, y: 313, w: 420, h: 245 };

    animateViewBox(fromBox, toBox, zoomDuration);

    // Everything except the run path itself and D1/A2's dots at their
    // resolved end positions fades away, so the zoomed frame reads as
    // "here's just the run, isolated." Times to finish right as the zoom
    // does. Includes the pitch markings themselves: the zoomed box (2.86x)
    // still has the right penalty area and six-yard box in frame at most
    // container widths, and the chalk-wobble filter's fixed 5-unit
    // displacement would read as much heavier jitter at this zoom level —
    // both reasons to fade them out rather than leave them as "context."
    var fadeTargets = document.querySelectorAll(
      ".player-dot:not(.runner), .defender-dot:not(.drift), .ball, .pass-lane, .pass-highlight, .end-mark, .pitch, .pitch-spot"
    );
    setTimeout(function () {
      fadeTargets.forEach(function (el) {
        el.style.transition = "opacity " + fadeOutDuration + "ms ease";
        el.style.opacity = 0;
      });
    }, Math.max(zoomDuration - fadeOutDuration, 0));

    // Short hold on the isolated run, then the Bézier construction —
    // control points and their connecting polygon — fades in as the
    // sequence's final resting state.
    setTimeout(function () {
      controlDots.forEach(function (dot) {
        dot.style.transition = "opacity " + fadeInDuration + "ms ease";
        dot.style.opacity = 1;
      });
      controlPolygon.style.transition = "opacity " + fadeInDuration + "ms ease";
      controlPolygon.style.opacity = 0.6;
    }, zoomDuration + holdDuration);
  }
})();
