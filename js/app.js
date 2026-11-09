(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NOISE = '0A1I+<>{}[]';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  $('#year').textContent = new Date().getFullYear();

  /* ───────────── nav ───────────── */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ───────────── headline: text set in shaded cells ───────────── */
  $$('[data-cells]').forEach((el) => {
    const text = el.textContent;
    el.textContent = '';
    let i = 0;
    text.split(' ').forEach((word, w, words) => {
      const group = document.createElement('span');
      group.className = 'cell-word';
      group.setAttribute('aria-hidden', 'true');
      for (const ch of word) {
        const s = document.createElement('span');
        s.className = 'cell';
        s.dataset.ch = ch;
        s.textContent = ch;
        s.style.setProperty('--i', i);
        s.style.setProperty('--shade', Glyph.SHADES[1 + Math.floor(Glyph.hash(i, 3) * 4)]);
        group.appendChild(s);
        i++;
      }
      el.appendChild(group);
      if (w < words.length - 1) el.appendChild(document.createTextNode(' '));
    });

    const scramble = (cell, duration) => {
      if (REDUCED) return;
      const end = performance.now() + duration;
      const tick = () => {
        if (performance.now() >= end) { cell.textContent = cell.dataset.ch; return; }
        cell.textContent = NOISE[Math.floor(Math.random() * NOISE.length)];
        setTimeout(tick, 55);
      };
      tick();
    };
    $$('.cell', el).forEach((cell, n) => {
      scramble(cell, 500 + n * 70);
      cell.addEventListener('pointerenter', () => scramble(cell, 260));
    });
  });

  /* ───────────── scroll reveal ───────────── */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('[data-reveal]').forEach((el) => {
    // stagger siblings that reveal together (cards, stats, steps)
    const sibs = $$(':scope > [data-reveal]', el.parentElement);
    el.style.setProperty('--d', `${Math.max(0, sibs.indexOf(el)) * 80}ms`);
    io.observe(el);
  });

  /* ───────────── order form ───────────── */
  const form = $('#order-form');
  const desc = $('#f-desc');
  const count = $('#desc-count');
  const preview = $('#json-preview');
  const progress = $('#preview-progress');
  const formErr = $('#form-err');
  const submitBtn = $('#submit-btn');
  const termBody = $('.term-body');
  const done = $('#term-done');
  const log = $('#term-log');
  const doneCard = $('#done-card');

  const PLACEHOLDERS = {
    app: 'e.g. A food ordering app for my restaurant. Customers order and pay online, I get a notification, and there is a simple admin panel to update the menu and prices.',
    website: 'e.g. A 5-page website for my coaching institute with course details, a photo gallery and an enquiry form that sends leads to WhatsApp.',
    ppt: 'e.g. A 12-slide investor pitch deck for my skincare brand. The content is in a Google Doc. I need it to look premium and minimal.',
    excel: 'e.g. A sales tracker for 3 shops with daily entries, monthly totals per shop and a dashboard with charts.',
    other: 'e.g. Tell us what you have in mind. If it involves software or slides, we can probably help.',
    none: "Tell us what it should do, who it's for, and anything you already have."
  };
  const REQUIRED_PHONE = ['whatsapp', 'call'];

  const clean = (v) => (v || '').trim() || null;

  function buildOrder() {
    const fd = new FormData(form);
    return {
      types: fd.getAll('types'),
      description: (fd.get('description') || '').trim(),
      budget: fd.get('budget') || null,
      timeline: fd.get('timeline') || null,
      name: (fd.get('name') || '').trim(),
      email: (fd.get('email') || '').trim(),
      phone: clean(fd.get('phone')),
      company: clean(fd.get('company')),
      contactVia: fd.get('contactVia') || 'email',
      links: clean(fd.get('links'))
    };
  }

  function validate(o) {
    const errs = {};
    if (!o.types.length) errs.types = '✗ choose at least one';
    if (o.description.length < 20) errs.description = `✗ a little more detail, please (${o.description.length}/20 characters minimum)`;
    if (!o.name) errs.name = '✗ required';
    if (!o.email) errs.email = '✗ required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) errs.email = "✗ that email doesn't look right";
    if (o.phone && o.phone.replace(/\D/g, '').length < 8) errs.phone = "✗ that number doesn't look right";
    else if (!o.phone && REQUIRED_PHONE.includes(o.contactVia)) errs.phone = `✗ we need your number for ${o.contactVia === 'call' ? 'a call' : 'WhatsApp'}`;
    return errs;
  }

  function showErrors(errs) {
    $$('[data-field]', form).forEach((f) => {
      const msg = errs[f.dataset.field] || '';
      f.classList.toggle('has-err', !!msg);
      const p = $(':scope > .err', f);
      if (p) p.textContent = msg;
    });
  }

  function clearError(field) {
    const f = $(`[data-field="${field}"]`, form);
    if (!f || !f.classList.contains('has-err')) return;
    f.classList.remove('has-err');
    $(':scope > .err', f).textContent = '';
  }

  function highlight(json) {
    const esc = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g, (m, str, colon, lit) => {
      if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`;
      if (lit) return `<span class="j-lit">${m}</span>`;
      return `<span class="j-num">${m}</span>`;
    });
  }

  function update() {
    const o = buildOrder();
    preview.innerHTML = highlight(JSON.stringify(o, null, 2));
    count.textContent = `${desc.value.length} / 4000`;
    desc.placeholder = PLACEHOLDERS[o.types[0] || 'none'];

    const filled = [o.types.length > 0, o.description.length >= 20, !!o.name, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)]
      .filter(Boolean).length;
    progress.textContent = filled === 4 ? 'ready to send' : `${filled} / 4 required fields`;
    progress.parentElement.classList.toggle('ready', filled === 4);
  }

  form.addEventListener('input', (e) => {
    const name = e.target.name;
    clearError(name);
    if (name === 'contactVia') clearError('phone');
    formErr.textContent = '';
    update();
  });

  // service cards → preselect the type and jump to the form
  $$('[data-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const box = $(`input[name="types"][value="${btn.dataset.order}"]`, form);
      box.checked = true;
      clearError('types');
      update();
      const chip = box.closest('.chip');
      chip.classList.remove('flash');
      void chip.offsetWidth;
      chip.classList.add('flash');
      $('#order').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
      setTimeout(() => desc.focus({ preventScroll: true }), REDUCED ? 0 : 700);
    });
  });

  async function typeLine(text, cls) {
    const line = document.createElement('span');
    line.className = `log-line ${cls || ''}`;
    log.appendChild(line);
    if (REDUCED) { line.textContent = text; return; }
    for (let i = 1; i <= text.length; i += 2) {
      line.textContent = text.slice(0, i);
      await sleep(8);
    }
    line.textContent = text;
  }

  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;

    const order = buildOrder();
    const errs = validate(order);
    showErrors(errs);
    const bad = Object.keys(errs);
    if (bad.length) {
      formErr.textContent = `✗ ${bad.length} field${bad.length > 1 ? 's need' : ' needs'} attention`;
      const first = $(`[data-field="${bad[0]}"]`, form);
      first.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
      const input = $('input, textarea', first);
      if (input) setTimeout(() => input.focus({ preventScroll: true }), REDUCED ? 0 : 400);
      return;
    }

    sending = true;
    submitBtn.disabled = true;
    order.createdAt = new Date().toISOString();

    termBody.classList.add('is-sending');
    done.hidden = false;
    doneCard.hidden = true;
    log.textContent = '';
    $('.term').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });

    const started = performance.now();
    const request = window.submitOrder(order);
    const size = (new Blob([JSON.stringify(order)]).size / 1024).toFixed(1);

    try {
      await typeLine(`$ order submit --type ${order.types.join(',')}`, 'cmd');
      await sleep(240);
      await typeLine('→ validating brief ............ ok');
      await sleep(240);
      await typeLine(`→ packing order.json .......... ok  (${size} kb)`);
      await sleep(240);
      await typeLine('→ notifying the team .......... ', 'pending');
      const res = await request;
      log.lastChild.textContent += 'ok';
      log.lastChild.classList.remove('pending');
      await sleep(200);
      await typeLine(`✓ done in ${((performance.now() - started) / 1000).toFixed(1)}s`, 'ok');
      await sleep(350);
      $('#done-id').textContent = res.id;
      doneCard.hidden = false;
    } catch (err) {
      console.error(err);
      await typeLine("✗ couldn't send your order. Check your connection and try again.", 'bad');
      await sleep(1600);
      done.hidden = true;
      termBody.classList.remove('is-sending');
      formErr.textContent = "✗ couldn't send. Your details are still here, so try again.";
    } finally {
      sending = false;
      submitBtn.disabled = false;
    }
  });

  $('#new-order').addEventListener('click', () => {
    form.reset();
    showErrors({});
    formErr.textContent = '';
    done.hidden = true;
    termBody.classList.remove('is-sending');
    update();
    $('.term').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  });

  update();
})();
