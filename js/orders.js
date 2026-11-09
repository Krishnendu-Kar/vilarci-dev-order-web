/* ──────────────────────────────────────────────────────────────
   Order submission.

   This is the only place that talks to a backend. For now it just
   simulates a network call. When the database is ready, replace the
   body of submitOrder() with a real insert, e.g. Supabase:

     const { data, error } = await supabase
       .from('orders').insert(order).select('id').single();
     if (error) throw error;
     return { id: data.id };

   `order` shape (see buildOrder() in app.js):
     { types: string[], description: string, budget: string|null,
       timeline: string|null, name: string, email: string,
       phone: string|null, company: string|null,
       contactVia: 'email'|'whatsapp'|'call', links: string|null,
       createdAt: ISO string }
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function makeId() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var id = '';
    for (var i = 0; i < 6; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
    return 'VD-' + id;
  }

  window.submitOrder = function (order) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        console.info('[orders] (mock) order submitted:', order);
        resolve({ id: makeId() });
      }, 900);
    });
  };
})();
