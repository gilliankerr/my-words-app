(function () {
  'use strict';
  let phase = 'Opening app files';
  const main = document.getElementById('main');
  const opening = () => main.hasAttribute('data-opening');
  function recover(event) {
    if (!opening()) return;
    const heading = document.createElement('h1'); heading.textContent = 'Opening paused';
    const message = document.createElement('p'); message.textContent = phase + (event ? ' could not finish.' : ' is taking too long.') + ' Your saved data has not been removed.'; message.setAttribute('role', 'status');
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry opening'; retry.onclick = () => location.reload();
    const fresh = document.createElement('a'); fresh.href = '/?fresh=1#home'; fresh.className = 'boot-recovery'; fresh.textContent = 'Open latest app files';
    main.replaceChildren(heading, message, retry, fresh);
  }
  const timer = setTimeout(recover, 15000);
  window.addEventListener('error', recover);
  window.addEventListener('unhandledrejection', recover);
  const openingCopy = { 'Opening saved storage': 'Getting your saved words ready', 'Reading saved sign-in': 'Opening your saved account', 'Loading communication words': 'Preparing words and pictures', 'Checking sign-in': 'Checking access to your saved words' };
  window.NextBoot = { phase(value) { phase = value; const text = main.querySelector('[role="status"]'); if (opening() && text) text.textContent = (openingCopy[value] || 'Getting your words ready') + '…'; }, finish() { clearTimeout(timer); main.removeAttribute('data-opening'); } };
})();
