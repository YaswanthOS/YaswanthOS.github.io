// Two small jobs: mark the section being read in the side list, and play
// the two drawings on a loop.
//
// The chalkboard (the old hero, in a smaller role), one loop of ~15 s:
//   0. The mark: a gold arrow from D1 to A3, held alone so it registers.
//   1. The run: A2 draws a degree-5 Bezier; D1 reacts partway through and
//      drifts off A3 to track him instead.
//   2. Free: the ring on A3 pulses once on its own; he is unmarked.
//   3. The pass: a dashed lane and a travelling ball from A1 to A3.
//   4. Arrival: the same ring pulses again as the ball lands.
//   Then the traces fade, the players walk back, and it starts again.
//
// The corner sketch, one loop of ~12 s: the striker's decoy run drops deep
// and wide and drags a centre-back out of the back line; the gap he leaves
// is painted gold; a midfielder arrives from between the lines and a
// through ball meets him there. Then it fades, rewinds and starts again.
//
// Each drawing is a pure function of time, render(t), so looping, pausing
// and the ?t=<ms> test hook (freezes both drawings at that moment) are all
// the same code path.
//
// Every animated element ships in the markup at its FINAL state, so with no
// JS, or with prefers-reduced-motion, both drawings are simply complete.
// The inline script in <head> adds .anim to <html> only when motion is
// allowed; styles.css then hides the moving pieces (.live) until this file
// has put them on their starting marks and added .anim-started. Each
// drawing is set up separately: one that cannot be measured is left alone,
// at its finished state, and the other still plays.
(function () {
  "use strict";

  var root = document.documentElement;

  // ------------------------------------------------------------------
  // Side list: mark the section being read
  // ------------------------------------------------------------------

  (function () {
    var links = document.querySelectorAll('.toc a[href^="#"]');
    if (!links.length) return;

    var items = [];
    links.forEach(function (link) {
      var target = document.getElementById(link.getAttribute("href").slice(1));
      if (target) items.push({ link: link, target: target });
    });
    if (!items.length) return;

    var current = null;
    var queued = false;

    function update() {
      queued = false;
      var line = window.innerHeight * 0.35;
      var found = items[0];
      for (var i = 0; i < items.length; i++) {
        if (items[i].target.getBoundingClientRect().top <= line) found = items[i];
      }
      // At the very end of the page the last section may never reach the
      // reading line, so the bottom of the page counts as the last section.
      var doc = document.documentElement;
      if (window.innerHeight + window.pageYOffset >= doc.scrollHeight - 2) {
        found = items[items.length - 1];
      }
      if (found === current) return;
      if (current) current.link.removeAttribute("aria-current");
      found.link.setAttribute("aria-current", "true");
      current = found;
    }

    function queue() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    }

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    update();
  })();

  // ------------------------------------------------------------------
  // The drawings
  // ------------------------------------------------------------------

  if (!root.classList.contains("anim")) return; // reduced motion: stay finished

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }
  // progress through a beat that starts at `start` and lasts `duration` ms
  function span(t, start, duration) {
    return clamp01((t - start) / duration);
  }
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function mix(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  function quadratic(p0, p1, p2, t) {
    var m = 1 - t;
    return {
      x: m * m * p0.x + 2 * m * t * p1.x + t * t * p2.x,
      y: m * m * p0.y + 2 * m * t * p1.y + t * t * p2.y,
    };
  }
  // A ring that flares and settles: u runs 0 to 1 over the pulse.
  function pulse(u, settle) {
    if (u <= 0) return { opacity: 0, scale: 0.6 };
    if (u < 0.45) {
      var k = u / 0.45;
      return { opacity: k, scale: 0.6 + 0.75 * k };
    }
    var k2 = (u - 0.45) / 0.55;
    return { opacity: 1 + (settle - 1) * k2, scale: 1.35 - 0.35 * k2 };
  }
  // Draw a path on by dash offset. Hidden at zero: a round cap would
  // otherwise leave a dot at the start.
  function drawOn(path, length, fraction) {
    path.style.strokeDasharray = length + " " + (length + 20);
    path.style.strokeDashoffset = length * (1 - fraction);
    path.style.visibility = fraction > 0 ? "visible" : "hidden";
  }
  function place(circle, point) {
    circle.setAttribute("cx", point.x.toFixed(1));
    circle.setAttribute("cy", point.y.toFixed(1));
  }
  function moveTo(group, point) {
    group.setAttribute("transform", "translate(" + point.x.toFixed(1) + "," + point.y.toFixed(1) + ")");
  }
  function pointAt(path, length, fraction) {
    return path.getPointAtLength(length * fraction);
  }

  // --- The chalkboard ---
  // Setup only reads; nothing is changed until render() first runs, so a
  // board that fails here keeps its finished state.
  function setUpBoard() {
    var svg = document.querySelector(".board-svg");
    if (!svg) return null;
    function q(selector) {
      return svg.querySelector(selector);
    }
    var runPath = q(".trajectory");
    var runner = q(".runner");
    var defender = q(".drift");
    var markingArrow = q(".marking-arrow");
    var passPath = q(".pass-reveal-path");
    var passLane = q(".pass-lane");
    var ball = q(".ball");
    var ring = q(".pass-highlight");
    var endMark = q(".end-mark");
    if (!(runPath && runner && defender && markingArrow && passPath && passLane && ball && ring && endMark)) {
      return null;
    }
    var runLength = runPath.getTotalLength();
    var passLength = passPath.getTotalLength();
    if (!(runLength > 0) || !(passLength > 0)) return null;

    var runStart = pointAt(runPath, runLength, 0);
    var runEnd = pointAt(runPath, runLength, 1);
    // D1 chases on a curve that dips wide first, echoing the run's early
    // bulge, and ends a step behind the runner (the markup's own mark).
    var defenderStart = { x: 840, y: 420 };
    var defenderControl = { x: 870, y: 480 };
    var defenderEnd = {
      x: parseFloat(defender.getAttribute("cx")),
      y: parseFloat(defender.getAttribute("cy")),
    };
    var ballStart = pointAt(passPath, passLength, 0); // A1, holding it
    var ballEnd = pointAt(passPath, passLength, 1); // A3, on arrival

    function render(t) {
      var fade = 1 - span(t, 13300, 600); // the traces fade out...
      var back = easeInOutCubic(span(t, 13900, 1000)); // ...then everyone walks back

      // Beat 0: the mark, faded out as the run begins
      markingArrow.style.opacity = Math.min(span(t, 0, 300), 1 - span(t, 1700, 350));

      // Beat 1: the run, and D1 tracking it from 15% of the way in
      var run = span(t, 1700, 5200);
      var runEased = easeOutCubic(run);
      drawOn(runPath, runLength, runEased);
      runPath.style.opacity = 0.92 * fade;
      place(runner, back > 0 ? mix(runEnd, runStart, back) : pointAt(runPath, runLength, runEased));

      var chase = easeOutCubic(clamp01((run - 0.15) / 0.85));
      place(
        defender,
        back > 0 ? mix(defenderEnd, defenderStart, back) : quadratic(defenderStart, defenderControl, defenderEnd, chase)
      );
      endMark.style.opacity = span(t, 6900, 400) * fade;

      // Beats 2 and 4: "free", then arrival, on the same ring
      var ringState = t < 10950 ? pulse(span(t, 8000, 600), 0.6) : pulse(span(t, 10950, 600), 0.6);
      ring.style.opacity = ringState.opacity * fade;
      ring.style.transform = "scale(" + ringState.scale.toFixed(3) + ")";

      // Beat 3: the pass; the ball rides the same path as the reveal
      var pass = easeOutCubic(span(t, 8950, 2000));
      drawOn(passPath, passLength, pass);
      passLane.style.opacity = 0.85 * fade;
      moveTo(ball, back > 0 ? mix(ballEnd, ballStart, back) : pointAt(passPath, passLength, pass));
    }

    return { period: 15400, render: render };
  }

  // --- The corner sketch ---
  function setUpSketch() {
    var svg = document.querySelector(".art-svg");
    if (!svg) return null;
    function q(selector) {
      return svg.querySelector(selector);
    }
    var decoyPath = q(".art-decoy");
    var arrivePath = q(".art-arrive");
    var dragPath = q(".art-drag");
    var passPath = q(".art-pass-reveal-path");
    var passLine = q(".art-pass");
    var decoyRunner = q(".art-decoy-runner");
    var centreBack = q(".art-cb");
    var receiver = q(".art-receiver");
    var ball = q(".art-ball");
    var space = q(".art-space");
    var ring = q(".art-pulse");
    var backline = q(".art-backline");
    var labelDecoy = q(".art-label-decoy");
    var labelSpace = q(".art-label-space");
    var ghosts = svg.querySelectorAll(".art-ghost"); // decoy runner, centre-back, receiver
    if (
      !(decoyPath && arrivePath && dragPath && passPath && passLine && decoyRunner && centreBack &&
        receiver && ball && space && ring && backline && labelDecoy && labelSpace && ghosts.length === 3)
    ) {
      return null;
    }
    var decoyLength = decoyPath.getTotalLength();
    var arriveLength = arrivePath.getTotalLength();
    var dragLength = dragPath.getTotalLength();
    var passLength = passPath.getTotalLength();
    if (!(decoyLength > 0 && arriveLength > 0 && dragLength > 0 && passLength > 0)) return null;

    var linePoints = backline
      .getAttribute("points")
      .trim()
      .split(/\s+/)
      .map(function (pair) {
        var xy = pair.split(",");
        return { x: parseFloat(xy[0]), y: parseFloat(xy[1]) };
      });
    if (linePoints.length !== 4) return null;

    var decoyStart = pointAt(decoyPath, decoyLength, 0);
    var decoyEnd = pointAt(decoyPath, decoyLength, 1);
    var cbStart = pointAt(dragPath, dragLength, 0);
    var cbEnd = pointAt(dragPath, dragLength, 1);
    var receiverStart = pointAt(arrivePath, arriveLength, 0);
    var receiverEnd = pointAt(arrivePath, arriveLength, 1);
    var ballStart = pointAt(passPath, passLength, 0);
    var ballEnd = pointAt(passPath, passLength, 1);
    var spaceCentre = { x: 228, y: 268 };

    function render(t) {
      var fade = 1 - span(t, 9300, 600);
      var back = easeInOutCubic(span(t, 9900, 1200));

      // The decoy run, and the centre-back following it a beat late
      var decoy = span(t, 700, 2600);
      var decoyEased = easeInOutCubic(decoy);
      drawOn(decoyPath, decoyLength, decoyEased);
      decoyPath.style.opacity = fade;
      place(decoyRunner, back > 0 ? mix(decoyEnd, decoyStart, back) : pointAt(decoyPath, decoyLength, decoyEased));

      var drag = easeInOutCubic(clamp01((decoy - 0.18) / 0.82));
      drawOn(dragPath, dragLength, drag);
      dragPath.style.opacity = fade;
      var cb = back > 0 ? mix(cbEnd, cbStart, back) : pointAt(dragPath, dragLength, drag);
      place(centreBack, cb);

      // The back line bends with him
      backline.setAttribute(
        "points",
        linePoints
          .map(function (point, index) {
            var p = index === 1 ? cb : point;
            return p.x.toFixed(1) + "," + p.y.toFixed(1);
          })
          .join(" ")
      );

      // The space he leaves, painted in
      var open = easeOutCubic(span(t, 2700, 1000));
      var scale = 0.8 + 0.2 * open;
      space.style.opacity = open * fade;
      space.setAttribute(
        "transform",
        "translate(" + spaceCentre.x + " " + spaceCentre.y + ") scale(" + scale.toFixed(3) + ") translate(" +
          -spaceCentre.x + " " + -spaceCentre.y + ")"
      );
      labelDecoy.style.opacity = span(t, 3000, 400) * fade;
      labelSpace.style.opacity = span(t, 3300, 400) * fade;

      // The late run into it, and the through ball to meet him
      var arrive = easeInOutCubic(span(t, 3300, 2000));
      drawOn(arrivePath, arriveLength, arrive);
      arrivePath.style.opacity = fade;
      place(receiver, back > 0 ? mix(receiverEnd, receiverStart, back) : pointAt(arrivePath, arriveLength, arrive));

      var pass = easeOutCubic(span(t, 3900, 1400));
      drawOn(passPath, passLength, pass);
      passLine.style.opacity = fade;
      moveTo(ball, back > 0 ? mix(ballEnd, ballStart, back) : pointAt(passPath, passLength, pass));

      var ringState = pulse(span(t, 5300, 600), 0.5);
      ring.style.opacity = ringState.opacity * fade;
      ring.style.transform = "scale(" + ringState.scale.toFixed(3) + ")";

      // Dashed rings mark where each mover started
      ghosts[0].style.opacity = span(t, 700, 300) * fade;
      ghosts[1].style.opacity = clamp01((decoy - 0.18) * 6) * fade;
      ghosts[2].style.opacity = span(t, 3300, 300) * fade;
    }

    return { period: 11600, render: render };
  }

  function attempt(setUp) {
    try {
      return setUp();
    } catch (e) {
      return null;
    }
  }

  var drawings = [attempt(setUpBoard), attempt(setUpSketch)].filter(Boolean);
  if (!drawings.length) {
    root.classList.remove("anim");
    return;
  }

  function renderAll(elapsed) {
    drawings.forEach(function (drawing) {
      drawing.render(elapsed % drawing.period);
    });
  }

  // Test hook: ?t=1234 freezes both drawings at 1234 ms into their loops.
  var frozenAt = null;
  try {
    var requested = new URLSearchParams(window.location.search).get("t");
    if (requested !== null && requested !== "" && isFinite(Number(requested))) {
      frozenAt = Math.max(0, Number(requested));
    }
  } catch (e) {}

  // First frame synchronously, then reveal: nothing is ever seen out of place.
  renderAll(frozenAt === null ? 0 : frozenAt);
  root.classList.add("anim-started");
  if (frozenAt !== null) return;

  var elapsed = 0;
  var last = null;
  var paused = false;
  var frameId = null;

  function frame(now) {
    if (paused) return;
    // Capped step, so a background tab or a long pause never jumps ahead.
    if (last !== null) elapsed += Math.min(now - last, 100);
    last = now;
    renderAll(elapsed);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  var toggle = document.querySelector(".motion-toggle");
  if (toggle) {
    var icon = toggle.querySelector(".motion-icon");
    var text = toggle.querySelector(".motion-text");
    toggle.addEventListener("click", function () {
      paused = !paused;
      toggle.setAttribute("aria-label", paused ? "Play the animations" : "Pause the animations");
      if (icon) icon.textContent = paused ? "▶" : "❚❚";
      if (text) text.textContent = paused ? "play" : "pause";
      if (paused) {
        cancelAnimationFrame(frameId);
      } else {
        last = null;
        frameId = requestAnimationFrame(frame);
      }
    });
  }
})();
