(() => {
  'use strict';
  document.getElementById('privacy-back').addEventListener('click', () => {
    if (history.length > 1) history.back(); else location.assign('/');
  });
})();
