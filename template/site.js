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
