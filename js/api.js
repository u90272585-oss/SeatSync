'use strict';
// All pages use one server session. Never use a browser-selected role as permission.
window.SeatSyncAPI = (() => {
  let user = null;
  async function request(path, method = 'GET', body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`/api${path}`, { method, credentials:'same-origin', signal:controller.signal,
        headers: { 'Content-Type':'application/json', 'X-SeatSync-Request':'1' },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json().catch(() => { throw new Error('The API is unavailable. Start SeatSync with python app.py, not a static file server.'); });
      if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), {status:response.status});
      return data;
    } catch (error) {
      if(error.name === 'AbortError' || error instanceof TypeError) throw new Error('Cannot reach the server. Check your connection and try again.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  const ready = request('/session').then(data => { user=data.user; return user; });
  // Display an error even on a page with no form. Dependent pages also handle failures.
  ready.catch(error => {
    const note=document.createElement('p'); note.className='notice'; note.setAttribute('role','alert');
    note.textContent=error.message; document.querySelector('main')?.prepend(note);
  });
  return {request,ready,get user(){return user;}};
})();
