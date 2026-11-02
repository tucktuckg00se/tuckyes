(() => {
  // Dust and scratches, like an old print going through a projector.
  // Runs behind the page, pauses when the tab is hidden, and stays off
  // for anyone who has asked their device to reduce motion.
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.body.dataset.effect === 'grain' && !still) {
    const c = document.createElement('canvas');
    c.className = 'fx-dust';
    c.setAttribute('aria-hidden', 'true');
    document.body.prepend(c);
    const ctx = c.getContext('2d');
    let w = 0, h = 0;
    const size = () => { w = c.width = Math.ceil(innerWidth / 2); h = c.height = Math.ceil(innerHeight / 2); };
    size();
    addEventListener('resize', size);

    let scratches = [];
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      // specks of dust, light and dark, for one frame each
      const specks = Math.random() < 0.55 ? 1 + Math.floor(Math.random() * 3) : 0;
      for (let i = 0; i < specks; i++) {
        const light = Math.random() < 0.7;
        ctx.fillStyle = light ? `rgba(235,230,215,${0.25 + Math.random() * 0.4})` : `rgba(0,0,0,${0.4 + Math.random() * 0.4})`;
        const x = Math.random() * w, y = Math.random() * h, r = 0.4 + Math.random() * 1.4;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.5 + Math.random()), Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // now and then, a hair
      if (Math.random() < 0.02) {
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.lineWidth = 0.6;
        const x = Math.random() * w, y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 8, y - 6, x + 4, y + 14, x + 16 * Math.random(), y + 22);
        ctx.stroke();
      }
      // scratches run down the frame and wobble for a few frames
      if (Math.random() < 0.035) scratches.push({ x: Math.random() * w, life: 3 + Math.floor(Math.random() * 10), a: 0.08 + Math.random() * 0.12 });
      scratches = scratches.filter(s => s.life-- > 0);
      for (const s of scratches) {
        s.x += (Math.random() - 0.5) * 1.5;
        ctx.fillStyle = `rgba(230,225,210,${s.a})`;
        ctx.fillRect(s.x, 0, 0.6, h);
      }
    };
    let timer = null;
    const start = () => { if (!timer) timer = setInterval(frame, 1000 / 12); };
    const stop = () => { clearInterval(timer); timer = null; };
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    start();
  }

  // Pixel particles: square specks drifting slowly upward and fading in and
  // out, drawn at a third of screen resolution so every speck is a crisp pixel.
  // Not interactive. Holds still for anyone who has asked to reduce motion.
  if (document.body.dataset.effect === 'pixels') {
    const c = document.createElement('canvas');
    c.className = 'fx-pixels';
    c.setAttribute('aria-hidden', 'true');
    document.body.prepend(c);
    const ctx = c.getContext('2d');
    const SCALE = 3;
    const TINTS = ['235,235,235', '235,235,235', '235,235,235', '200,214,255', '255,214,190'];
    let w = 0, h = 0, dots = [];
    const spawn = (y) => ({
      x: Math.random() * w,
      y: y ?? Math.random() * h,
      vx: (Math.random() - 0.5) * 0.06,
      vy: -(0.03 + Math.random() * 0.12),
      size: Math.random() < 0.15 ? 2 : 1,
      a: 0.12 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.1,
      tint: TINTS[Math.floor(Math.random() * TINTS.length)],
    });
    const size = () => {
      w = c.width = Math.ceil(innerWidth / SCALE);
      h = c.height = Math.ceil(innerHeight / SCALE);
      const want = Math.round((w * h) / 1400);
      while (dots.length < want) dots.push(spawn());
      dots.length = want;
    };
    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        const glow = 0.55 + 0.45 * Math.sin(d.phase + (t / 1000) * d.speed);
        ctx.fillStyle = `rgba(${d.tint},${(d.a * glow).toFixed(3)})`;
        ctx.fillRect(Math.round(d.x), Math.round(d.y), d.size, d.size);
      }
    };
    size();
    addEventListener('resize', size);
    if (still) draw(0);
    else {
      let last = 0, raf = 0;
      const tick = (t) => {
        raf = requestAnimationFrame(tick);
        if (t - last < 1000 / 30) return;
        const dt = last ? Math.min((t - last) / (1000 / 30), 3) : 1;
        last = t;
        for (const d of dots) {
          d.x += d.vx * dt; d.y += d.vy * dt;
          if (d.y < -2) Object.assign(d, spawn(h + 1));
          if (d.x < -2) d.x = w + 1; else if (d.x > w + 2) d.x = -1;
        }
        draw(t);
      };
      raf = requestAnimationFrame(tick);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
        else if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
      });
    }
  }

  // Newest songs: click one to load it into the player above.
  const spPlayer = document.querySelector('.sp-player');
  document.querySelectorAll('.sp-list a[data-track]').forEach(a => a.addEventListener('click', e => {
    if (!spPlayer || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    spPlayer.src = `https://open.spotify.com/embed/track/${a.dataset.track}?utm_source=generator&theme=0`;
    document.querySelectorAll('.sp-list li.on').forEach(li => li.classList.remove('on'));
    a.parentElement.classList.add('on');
  }));

  // "Forward to Friend" copies the link.
  const share = document.getElementById('share');
  if (share) {
    share.addEventListener('click', async () => {
      const url = location.href.split('#')[0];
      const label = share.querySelector('span') || share;
      try { await navigator.clipboard.writeText(url); label.textContent = 'Link copied!'; }
      catch (e) { label.textContent = url; }
      setTimeout(() => { label.textContent = 'Forward to Friend'; }, 2500);
    });
  }

  // Click a photo to see it bigger.
  const dlg = document.querySelector('dialog.lb');
  if (!dlg) return;
  const dImg = dlg.querySelector('img'), dCap = dlg.querySelector('.cap');
  document.querySelectorAll('.photos button').forEach(b => b.addEventListener('click', () => {
    const img = b.querySelector('img');
    dImg.src = img.currentSrc || img.src; dImg.alt = img.alt; dCap.textContent = img.alt;
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }));
  dlg.querySelector('.close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();
