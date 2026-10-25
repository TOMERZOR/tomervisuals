(() => {
  "use strict";

  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const wide = matchMedia("(min-width: 1100px)");
  const hasIO = "IntersectionObserver" in window;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
  };

  /* ---------- Shutter sound (synthesised, off until the visitor turns it on) ---------- */
  const soundBtn = document.querySelector(".sound");
  let soundOn = store.get("tz-sound") === "1";
  let audio = null;
  const setSound = (on) => {
    soundOn = on;
    if (soundBtn) soundBtn.setAttribute("aria-pressed", String(on));
    store.set("tz-sound", on ? "1" : "0");
  };
  const click = (soft) => {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      [[0, 1500, 0.9], [0.05, 2600, 0.55]].forEach(([dt, freq, vol]) => {
        const len = 0.035;
        const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
        const src = audio.createBufferSource();
        const band = audio.createBiquadFilter();
        const gain = audio.createGain();
        src.buffer = buf;
        band.type = "bandpass"; band.frequency.value = freq; band.Q.value = 0.8;
        gain.gain.value = vol * (soft ? 0.35 : 0.7);
        src.connect(band).connect(gain).connect(audio.destination);
        src.start(t + dt);
      });
    } catch (_) { /* no audio */ }
  };
  if (soundBtn) {
    setSound(soundOn);
    soundBtn.addEventListener("click", () => { setSound(!soundOn); click(); });
  }

  /* ---------- Top bar + menu ---------- */
  const bar = document.querySelector(".bar");
  const vf = document.querySelector(".vf");
  if (bar && vf && hasIO) {
    new IntersectionObserver(([e]) => bar.classList.toggle("is-solid", !e.isIntersecting),
      { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` }).observe(vf);
  }
  const menuBtn = document.querySelector(".menu-toggle");
  const nav = document.getElementById("site-nav");
  const setMenu = (open) => {
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "סגירת התפריט" : "פתיחת התפריט");
    bar.classList.toggle("menu-open", open);
  };
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", () => setMenu(menuBtn.getAttribute("aria-expanded") !== "true"));
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && bar.classList.contains("menu-open")) { setMenu(false); menuBtn.focus(); } });
  }

  /* ---------- Flash ---------- */
  const flashEl = document.querySelector(".flash");
  const flash = () => {
    if (!flashEl || reduce.matches) return;
    flashEl.classList.remove("is-on"); void flashEl.offsetWidth; flashEl.classList.add("is-on");
  };

  /* ---------- Power-on: the aperture opens ---------- */
  const iris = document.querySelector(".iris");
  const runIris = () => new Promise((resolve) => {
    if (!iris || reduce.matches) { if (iris) iris.remove(); resolve(); return; }
    const ctx = iris.getContext("2d");
    iris.classList.add("is-running");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = innerWidth, H = innerHeight;
    iris.width = W * dpr; iris.height = H * dpr;
    ctx.scale(dpr, dpr);
    const R = Math.hypot(W, H) * 0.62;
    const n = 7, start = performance.now() + 260, dur = 1250;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const frame = (now) => {
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      const r = ease(t) * R, rot = 0.9 - ease(t) * 0.9;
      const cx = W / 2, cy = H / 2;
      const pts = Array.from({ length: n }, (_, k) => {
        const a = rot + (k * Math.PI * 2) / n;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      });
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = "#09090a";
      ctx.fill("evenodd");
      // blade edges: each side of the opening continues out past its corner
      ctx.strokeStyle = "rgba(242,241,236,0.16)";
      ctx.lineWidth = 1.2;
      pts.forEach(([x, y], k) => {
        const [px, py] = pts[(k + n - 1) % n];
        const dx = x - px, dy = y - py, len = Math.hypot(dx, dy) || 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (dx / len) * R * 1.4, y + (dy / len) * R * 1.4); ctx.stroke();
      });
      if (t < 1) requestAnimationFrame(frame);
      else { iris.remove(); resolve(); }
    };
    requestAnimationFrame(frame);
  });

  /* ---------- Viewfinder: scroll is the shutter ---------- */
  const frames = [...document.querySelectorAll(".vf__frame")];
  const blinkEl = document.querySelector(".vf__blink");
  const afBox = document.querySelector(".hud__af");
  let current = -1;
  let lastBlink = 0;
  // Later frames wait in <template> so they only download once the burst needs them.
  const hydrate = (fr) => fr.querySelectorAll("template").forEach((t) => t.replaceWith(t.content));
  const blink = (el) => {
    const now = performance.now();
    if (reduce.matches || now - lastBlink < 340) return; // never more than three flashes a second
    lastBlink = now;
    el.classList.remove("is-on"); void el.offsetWidth; el.classList.add("is-on");
  };
  const showFrame = (i, quiet) => {
    if (i === current || !frames[i]) return;
    hydrate(frames[i]);
    if (frames[current]) frames[current].classList.remove("is-on");
    frames[i].classList.add("is-on");
    current = i;
    if (!quiet) {
      blink(blinkEl);
      click(true);
      if (afBox && !reduce.matches) {
        afBox.classList.remove("is-hunting", "is-locked"); void afBox.offsetWidth; afBox.classList.add("is-hunting");
        setTimeout(() => afBox.classList.add("is-locked"), 260);
      }
    }
  };
  if (frames.length) {
    showFrame(0, true);
    if (afBox) afBox.classList.add("is-locked");
    const first = frames[0].querySelector("img");
    const early = () => frames.slice(1, 4).forEach(hydrate);
    if (first.complete) early(); else first.addEventListener("load", early, { once: true });
    window.addEventListener("load", () => setTimeout(() => frames.forEach(hydrate), 400), { once: true });
    let userScrolled = false;
    if (hasIO) {
      const steps = [...document.querySelectorAll(".vf__steps i")];
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const i = steps.indexOf(e.target);
          if (i > 0 || current !== 0) userScrolled = true;
          showFrame(i);
        });
      }, { rootMargin: "-50% 0px -50% 0px" });
      steps.forEach((s) => io.observe(s));
    }
    // After power-on, fire a short burst so the viewfinder comes alive before any scroll.
    runIris().then(() => {
      if (reduce.matches || scrollY > 10) return;
      const seq = [1, 2, 3, 0];
      seq.forEach((i, k) => setTimeout(() => { if (!userScrolled && scrollY < 10) showFrame(i); }, 380 + k * 360));
    });
  } else {
    runIris();
  }

  /* ---------- Focus pull and develop on scroll ---------- */
  if (hasIO && !reduce.matches) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add(e.target.classList.contains("tile") ? "dev" : "in");
      io.unobserve(e.target);
    }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll("[data-pull], .about__photo, .tile").forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll("[data-pull], .about__photo").forEach((el) => el.classList.add("in"));
  }

  /* ---------- Focus cursor: brackets follow the pointer and lock onto work ---------- */
  const af = document.querySelector(".af");
  if (af && fine.matches && !reduce.matches) {
    const corners = [...af.children];
    const pos = corners.map(() => ({ x: -50, y: -50 }));
    let mx = -100, my = -100, target = null, raf = 0, shown = false, lockTimer = 0;
    const C = 14;
    const goal = () => {
      if (target) {
        const r = target.getBoundingClientRect(), i = 10;
        return [[r.left + i, r.top + i], [r.right - i - C, r.top + i], [r.left + i, r.bottom - i - C], [r.right - i - C, r.bottom - i - C]];
      }
      const s = 18;
      return [[mx - s, my - s], [mx + s - C, my - s], [mx - s, my + s - C], [mx + s - C, my + s - C]];
    };
    const tick = () => {
      const g = goal();
      let moving = false;
      pos.forEach((p, k) => {
        p.x += (g[k][0] - p.x) * 0.22; p.y += (g[k][1] - p.y) * 0.22;
        if (Math.abs(g[k][0] - p.x) > 0.3 || Math.abs(g[k][1] - p.y) > 0.3) moving = true;
        corners[k].style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      });
      raf = moving || target ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
    document.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX; my = e.clientY;
      if (!shown) { shown = true; const g = goal(); pos.forEach((p, k) => { p.x = g[k][0]; p.y = g[k][1]; }); af.classList.add("is-on"); }
      wake();
    }, { passive: true });
    document.addEventListener("pointerover", (e) => {
      const t = e.target.closest("[data-af]");
      if (t === target) return;
      target = t;
      clearTimeout(lockTimer);
      af.classList.remove("is-locked");
      if (t) lockTimer = setTimeout(() => { af.classList.add("is-locked"); click(true); }, 220);
      wake();
    });
    document.addEventListener("pointerout", (e) => { if (!e.relatedTarget) { af.classList.remove("is-on"); shown = false; } });
  } else if (af) {
    af.remove();
  }

  /* ---------- The roll: masonry, mode dial, playback ---------- */
  const gallery = document.querySelector(".gallery");
  const tiles = gallery ? [...gallery.querySelectorAll(".tile")] : [];
  let filter = "all";
  let visible = tiles;
  tiles.forEach((t) => {
    const img = t.querySelector("img");
    const done = () => img.classList.add("is-loaded");
    if (img.complete && img.naturalWidth) done(); else { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); }
  });
  const layout = () => {
    if (!gallery) return;
    const n = wide.matches ? 3 : 2;
    visible = tiles.filter((t) => filter === "all" || t.dataset.cat === filter);
    const cols = Array.from({ length: n }, () => Object.assign(document.createElement("div"), { className: "gallery__col" }));
    const h = new Array(n).fill(0);
    visible.forEach((t) => { const i = h.indexOf(Math.min(...h)); cols[i].appendChild(t); h[i] += Number(t.dataset.h) / Number(t.dataset.w) + 0.03; });
    gallery.style.setProperty("--cols", n);
    gallery.replaceChildren(...cols);
    gallery.classList.add("is-masonry");
  };
  if (gallery) { layout(); wide.addEventListener("change", layout); }

  const dial = document.querySelector(".dial");
  if (dial && gallery) {
    const wheel = dial.querySelector(".dial__wheel");
    const opts = [...dial.querySelectorAll(".dial__opt")];
    const count = dial.querySelector(".dial__count");
    const STEP = 30;
    let sel = 0;
    const rotTo = (deg) => wheel.style.setProperty("--rot", `${deg}deg`);
    const setCount = () => { count.textContent = `${visible.length} תמונות`; };
    const choose = (k, focus) => {
      k = Math.max(0, Math.min(opts.length - 1, k));
      rotTo(k * STEP);
      if (k === sel && filter === opts[k].dataset.filter) return;
      sel = k;
      opts.forEach((o, i) => { o.setAttribute("aria-checked", String(i === k)); o.tabIndex = i === k ? 0 : -1; });
      if (focus) opts[k].focus({ preventScroll: true });
      filter = opts[k].dataset.filter;
      click();
      if (reduce.matches) { layout(); setCount(); return; }
      gallery.classList.add("is-switching");
      setTimeout(() => {
        layout(); setCount();
        gallery.querySelectorAll(".tile").forEach((t) => { t.classList.remove("dev"); void t.offsetWidth; t.classList.add("dev"); });
        requestAnimationFrame(() => gallery.classList.remove("is-switching"));
      }, 200);
    };
    opts.forEach((o, i) => {
      o.style.setProperty("--a", `${-i * STEP}deg`);
      o.addEventListener("click", () => { if (!dragMoved) choose(i); });
      o.addEventListener("keydown", (e) => {
        const map = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1 };
        if (e.key in map) { e.preventDefault(); choose(sel + map[e.key], true); }
        if (e.key === "Home") { e.preventDefault(); choose(0, true); }
        if (e.key === "End") { e.preventDefault(); choose(opts.length - 1, true); }
      });
    });
    let dragX = 0, dragRot = 0, dragging = false, dragMoved = false;
    dial.addEventListener("pointerdown", (e) => { dragging = true; dragMoved = false; dragX = e.clientX; dragRot = sel * STEP; });
    dial.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragX;
      if (!dragMoved && Math.abs(dx) < 6) return;
      if (!dragMoved) { dragMoved = true; dial.classList.add("is-dragging"); dial.setPointerCapture(e.pointerId); }
      rotTo(Math.max(-12, Math.min((opts.length - 1) * STEP + 12, dragRot + dx * 0.45)));
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      if (!dragMoved) return;
      dial.classList.remove("is-dragging");
      const deg = dragRot + (e.clientX - dragX) * 0.45;
      choose(Math.round(deg / STEP));
      setTimeout(() => { dragMoved = false; }, 0);
    };
    dial.addEventListener("pointerup", endDrag);
    dial.addEventListener("pointercancel", endDrag);
    setCount();
    if (hasIO) {
      const work = document.getElementById("work");
      new IntersectionObserver(([e]) => dial.classList.toggle("is-on", e.isIntersecting), { rootMargin: "-35% 0px -25% 0px" }).observe(work);
    } else {
      dial.classList.add("is-on");
    }
  }

  /* ---------- Dialog helpers ---------- */
  let opener = null;
  const openDialog = (d, from) => { opener = from; root.classList.add("is-locked"); if (dial) dial.classList.add("is-hidden-by-dialog"); if (d.showModal) d.showModal(); else d.setAttribute("open", ""); };
  const closeDialog = (d) => { if (d.close) d.close(); else { d.removeAttribute("open"); d.dispatchEvent(new Event("close")); } };
  const onClosed = () => { root.classList.remove("is-locked"); if (opener) opener.focus({ preventScroll: true }); };

  /* ---------- Playback ---------- */
  const pb = document.getElementById("playback");
  if (pb && tiles.length) {
    const img = new Image();
    img.alt = "";
    img.decoding = "async";
    pb.querySelector(".viewer__stage").append(img);
    const pbBlink = pb.querySelector(".viewer__blink");
    const cap = pb.querySelector(".pb-caption");
    const f = (k) => pb.querySelector(`[data-pb='${k}']`);
    let idx = 0, token = 0;
    const render = (i, quiet) => {
      idx = (i + visible.length) % visible.length;
      const t = visible[idx];
      const thumb = t.querySelector("img");
      const my = ++token;
      img.alt = thumb.alt;
      img.src = thumb.currentSrc || thumb.src;
      const full = new Image(); full.src = t.dataset.full;
      full.decode().then(() => { if (my === token) img.src = full.src; }).catch(() => {});
      cap.textContent = thumb.alt;
      f("idx").textContent = `${String(idx + 1).padStart(3, "0")}/${String(visible.length).padStart(3, "0")}`;
      if (!quiet) { blink(pbBlink); click(true); }
      [1, -1].forEach((d) => { const n = visible[(idx + d + visible.length) % visible.length]; if (n) new Image().src = n.dataset.full; });
    };
    const next = () => render(idx + 1);
    const prev = () => render(idx - 1);
    gallery.addEventListener("click", (e) => {
      const b = e.target.closest(".tile__btn");
      if (!b) return;
      openDialog(pb, b);
      render(visible.indexOf(b.closest(".tile")), true);
      click();
    });
    pb.querySelector(".viewer__next").addEventListener("click", next);
    pb.querySelector(".viewer__prev").addEventListener("click", prev);
    pb.querySelector(".viewer__close").addEventListener("click", () => closeDialog(pb));
    pb.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); next(); }
      if (e.key === "ArrowRight") { e.preventDefault(); prev(); }
    });
    const stage = pb.querySelector(".viewer__stage");
    stage.addEventListener("click", (e) => { if (e.target === stage) closeDialog(pb); });
    let sx = 0, sy = 0;
    stage.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
    stage.addEventListener("pointerup", (e) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx > 0) next(); else prev(); // RTL: the next frame comes in from the left
    });
    pb.addEventListener("close", () => { if (dial) dial.classList.remove("is-hidden-by-dialog"); onClosed(); });
  }

  /* ---------- Reels: REC previews and the monitor ---------- */
  const vtiles = [...document.querySelectorAll(".vtile")];
  const play = (t) => {
    if (reduce.matches) return;
    const v = t.querySelector("video");
    if (!v.src) v.src = v.dataset.src;
    const p = v.play();
    if (p) p.then(() => t.classList.add("is-playing")).catch(() => {});
  };
  const stop = (t) => { const v = t.querySelector("video"); t.classList.remove("is-playing"); if (!v.paused) v.pause(); };
  if (hasIO) {
    const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting && e.intersectionRatio >= 0.6 ? play(e.target) : stop(e.target))), { threshold: [0, 0.6] });
    vtiles.forEach((t) => {
      const feat = t.closest(".vfeature");
      if (feat || !fine.matches) io.observe(t);
      if (!feat && fine.matches) {
        t.addEventListener("mouseenter", () => play(t));
        t.addEventListener("mouseleave", () => stop(t));
        t.addEventListener("focus", () => play(t));
        t.addEventListener("blur", () => stop(t));
      }
    });
  }
  const mon = document.getElementById("monitor");
  if (mon && vtiles.length) {
    const v = mon.querySelector("video");
    const title = mon.querySelector(".monitor-cap span:first-child");
    const meta = mon.querySelector(".monitor-cap span:last-child");
    vtiles.forEach((t) => t.addEventListener("click", () => {
      vtiles.forEach(stop);
      v.poster = t.querySelector("img").currentSrc || "";
      v.src = t.dataset.full;
      title.textContent = t.dataset.title;
      meta.textContent = t.dataset.meta;
      openDialog(mon, t);
      click();
      const p = v.play(); if (p) p.catch(() => {});
    }));
    mon.querySelector(".viewer__close").addEventListener("click", () => closeDialog(mon));
    mon.querySelector(".viewer__stage").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeDialog(mon); });
    mon.addEventListener("close", () => { v.pause(); v.removeAttribute("src"); v.load(); if (dial) dial.classList.remove("is-hidden-by-dialog"); onClosed(); });
  }

  /* ---------- Shutter: choose a subject, press, WhatsApp opens with the message ready ---------- */
  const PHONE = "972508882972";
  const base = "היי תומר, הגעתי מהאתר שלך ואשמח לקבל פרטים על ";
  const subjects = { general: "צילומים.", event: "צילום אירוע.", party: "צילום מסיבה.", campaign: "צילום קמפיין.", sport: "צילום ספורט." };
  const msgText = document.querySelector(".msg span");
  const waLinks = [...document.querySelectorAll("[data-wa]")];
  const setSubject = (key) => {
    const text = base + (subjects[key] || subjects.general);
    if (msgText) msgText.textContent = text;
    waLinks.forEach((a) => { if (a.dataset.wa === "subject") a.href = `https://wa.me/${PHONE}?text=${encodeURIComponent(text)}`; });
  };
  document.querySelectorAll(".subject .chip").forEach((chip, _, all) => chip.addEventListener("click", () => {
    const on = chip.getAttribute("aria-pressed") !== "true";
    all.forEach((c) => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", String(on));
    setSubject(on ? chip.dataset.subject : "general");
    click(true);
  }));
  setSubject("general");
  const shutter = document.querySelector(".shutter");
  if (shutter) shutter.addEventListener("click", () => {
    shutter.classList.add("is-pressed");
    setTimeout(() => shutter.classList.remove("is-pressed"), 160);
    flash(); click();
  });
})();
