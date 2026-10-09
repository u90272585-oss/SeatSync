'use strict';

// A self-service panel, not a live chat: no messages or contact details are collected.
(() => {
  const help = document.createElement('div');
  help.innerHTML = `
    <button type="button" class="help-launcher" aria-haspopup="dialog">? Help</button>
    <dialog class="booking-dialog help-dialog" aria-labelledby="help-title">
      <div class="dialog-heading"><h2 id="help-title">SeatSync Help</h2><button type="button" class="help-close" aria-label="Close help">✕</button></div>
      <p class="help-intro">Quick answers for this demo. This is not a live chat.</p>
      <details><summary>What is the 100 ₸ fee?</summary><p>It is a service fee per booking. Food and drinks are separate. No money is charged in this demo.</p></details>
      <details><summary>How do I cancel?</summary><p>Open your confirmation and select Cancel Booking, then confirm the cancellation. There is no additional cancellation fee. Under the proposed policy, the original service fee is not refunded if you cancel. Please cancel at least 24 hours before your visit whenever possible.</p></details>
      <details><summary>Can I change my booking?</summary><p>Use Edit Booking on the confirmation page. The same booking keeps its ID and no extra service fee is added. Cancelled bookings cannot be edited.</p></details>
      <details><summary>Where is my confirmation?</summary><p>The latest confirmation is saved in this browser. With a demo profile, you can also find your bookings in My bookings. Clearing browser storage removes saved demo information.</p></details>
      <details><summary>What if the venue cancels?</summary><p>The proposed policy provides a refund of the service fee if the venue cancels or a booking cannot be fulfilled. This demo does not process payments or refunds.</p></details>
      <details><summary>How can I contact the venue?</summary><p>For questions about accessibility, children or arriving late, contact the venue through its official contact details. Verified venue contacts are not connected to this demo yet.</p></details>
      <div class="dialog-actions"><a class="button" href="confirmation.html">Latest confirmation</a><a class="button button-secondary" href="my-bookings.html">My bookings</a></div>
    </dialog>`;
  document.body.append(help);
  const dialog = help.querySelector('dialog');
  help.querySelector('.help-launcher').addEventListener('click', () => dialog.showModal());
  help.querySelector('.help-close').addEventListener('click', () => dialog.close());
})();
