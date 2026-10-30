(() => {
  'use strict';

  // A one-use token lives only in this page's memory. Remove the fragment before
  // any session request; never write it to browser storage or diagnostics.
  const joining = document.body.dataset.betaPage === 'join';
  const parameters = new URLSearchParams(location.search);
  const invitationLink = joining && (new URLSearchParams(location.hash.slice(1)).has('token') || parameters.get('access') === 'private-link');
  let token = joining ? new URLSearchParams(location.hash.slice(1)).get('token') || '' : '';
  if (joining) {
    if (invitationLink) parameters.set('access', 'private-link');
    const query = parameters.toString();
    history.replaceState(history.state, '', location.pathname + (query ? '?' + query : ''));
  }

  const repository = new NextRepository();
  const error = document.getElementById('beta-error');
  const status = document.getElementById('beta-status');
  const usernameValid = value => /^[a-z0-9_-]{3,40}$/.test(value);
  const usernameMessage = 'Use a name like Alice, without spaces.';
  let busy = false;

  function clearFeedback() {
    error.textContent = '';
    status.textContent = '';
    document.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
  }

  function invalid(input, message) {
    error.textContent = message;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  function failureMessage(failure) {
    return failure instanceof TypeError || failure instanceof SyntaxError
      ? 'Could not connect or read the reply. Your entries are kept. Try again.'
      : failure.message || 'Could not finish. Your entries are kept. Try again.';
  }

  async function session() {
    const result = await repository.session();
    if (typeof result?.csrf !== 'string' || !result.csrf) throw new Error('Could not check this session. Your entries are kept. Try again.');
    return result;
  }

  if (joining) {
    const usingLink = invitationLink;
    const form = document.getElementById('activation-form');
    const username = document.getElementById('activation-username');
    const password = document.getElementById('activation-password');
    const confirm = document.getElementById('activation-confirm');
    document.getElementById('join-confirmation').hidden = !usingLink;
    confirm.disabled = !usingLink;
    const visibility = document.getElementById('join-password-visibility');
    visibility.setAttribute('aria-controls', usingLink ? 'activation-password activation-confirm' : 'activation-password');
    const hidePasswords = () => {
      password.type = confirm.type = 'password';
      visibility.textContent = usingLink ? 'Show passwords' : 'Show password'; visibility.setAttribute('aria-pressed', 'false');
    };
    hidePasswords();
    visibility.addEventListener('click', () => {
      const showing = password.type === 'password';
      password.type = confirm.type = showing ? 'text' : 'password';
      visibility.textContent = usingLink ? (showing ? 'Hide passwords' : 'Show passwords') : (showing ? 'Hide password' : 'Show password');
      visibility.setAttribute('aria-pressed', String(showing));
    });
    if (usingLink) {
      document.getElementById('join-heading').textContent = 'Choose your password';
      document.getElementById('join-introduction').textContent = 'Use the username you were given, or choose one if your invitation allows it. For recovery, enter your existing username. Your saved words stay in that account.';
      document.getElementById('join-submit').textContent = 'Set password';
      if (!token) {
        form.hidden = true;
        error.textContent = 'Reopen the original invitation or password-recovery link from your message. Its private code is not kept when this page reloads. If you already finished, use Sign in.';
      }
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      clearFeedback();
      if (usingLink && !token) { error.textContent = 'Reopen the original private link from your message.'; return; }
      const name = username.value.trim().toLowerCase();
      if (!usernameValid(name)) {
        invalid(username, name.length < 3 ? 'Use at least 3 letters or numbers.' : name.length > 40 ? 'This username is too long. Make it shorter.' : usernameMessage);
        return;
      }
      username.value = name;
      const bytes = new TextEncoder().encode(password.value).length;
      if (bytes < 12) { invalid(password, 'Add another word to make your password longer.'); return; }
      if (bytes > 72) { invalid(password, 'This password is too long. Make it shorter.'); return; }
      if (usingLink && password.value !== confirm.value) { invalid(confirm, 'The passwords do not match. Check both fields.'); return; }
      busy = true;
      form.setAttribute('aria-busy', 'true');
      form.querySelectorAll('input, button').forEach(control => { control.disabled = true; });
      status.textContent = usingLink ? 'Setting your password…' : 'Creating your account…';
      try {
        const current = await session();
        if (!usingLink && current.actor) throw new Error('You are already signed in. Open Home and sign out before creating another account. Your saved work stays in its account.');
        const result = await repository.request(usingLink ? 'activate' : 'register', { ...(usingLink ? { token } : {}), username: name, password: password.value });
        if (result?.success !== true || result.username !== name) throw new Error('Could not confirm the account is ready. Try Sign in with your chosen username and password, or contact the person who sent you this link.');
        token = '';
        hidePasswords();
        confirm.value = '';
        form.hidden = true;
        if (!usingLink) {
          status.textContent = 'Opening My Words…';
          try {
            const signedIn = await repository.signIn(name, password.value);
            if (typeof signedIn?.actor !== 'string' || !signedIn.actor || typeof signedIn?.workspace !== 'string' || !signedIn.workspace) throw new Error('Sign-in not confirmed.');
            // A per-tab, one-use destination hint, never a credential. The app
            // must verify the server session again before opening this account.
            sessionStorage.setItem('mywords-join-session', JSON.stringify({ actor: signedIn.actor, workspace: signedIn.workspace }));
            location.replace('/');
          } catch {
            status.textContent = 'Your account is ready. Choose Sign in to continue.';
            document.getElementById('beta-sign-in').focus();
          } finally { password.value = ''; }
          return;
        }
        password.value = '';
        status.textContent = `Account ready for ${result.username}. Use Sign in to open your words.`;
        document.getElementById('beta-sign-in').focus();
      } catch (failure) {
        status.textContent = '';
        error.textContent = failureMessage(failure);
      } finally {
        busy = false;
        form.removeAttribute('aria-busy');
        form.querySelectorAll('input, button').forEach(control => { control.disabled = false; });
        confirm.disabled = !usingLink;
      }
    });
    return;
  }

  const controls = document.getElementById('beta-controls');
  const retry = document.getElementById('beta-retry');
  const signIn = document.getElementById('beta-sign-in-nav');
  const invitationForm = document.getElementById('invitation-form');
  const invitationUsername = document.getElementById('invitation-username');
  const recoveryForm = document.getElementById('recovery-form');
  const recoveryUsername = document.getElementById('recovery-username');
  const resultPanel = document.getElementById('private-link-result');
  const link = document.getElementById('private-link');
  const invitationStep = document.getElementById('invitation-step');
  const send = document.getElementById('send-private-link');
  const another = document.getElementById('another-invitation');
  let accountCount = 0;
  let recoveryLink = false;

  function accessFailure(code) {
    controls.hidden = true;
    resultPanel.hidden = true;
    link.value = '';
    signIn.hidden = false;
    signIn.querySelector('a').href = '/?return=invite';
    retry.hidden = true;
    status.textContent = '';
    error.textContent = code === 401
      ? 'Sign in to invite someone. You will return to this page.'
      : 'Only the beta organizer can create private links. Ask the person who invited you for help.';
  }

  function setBusy(value) {
    busy = value;
    controls.setAttribute('aria-busy', String(value));
    controls.querySelectorAll('input, select, button').forEach(control => { control.disabled = value; });
    if (!value && accountCount === 0) {
      recoveryUsername.disabled = true;
      document.getElementById('recovery-submit').disabled = true;
    }
  }

  async function load() {
    if (busy) return;
    busy = true;
    clearFeedback();
    controls.hidden = true;
    retry.hidden = true;
    signIn.hidden = true;
    status.textContent = 'Checking access…';
    try {
      const current = await session();
      if (!current.actor) { accessFailure(401); return; }
      const result = await repository.request('beta');
      if (result?.admin !== true) { accessFailure(403); return; }
      if (!Array.isArray(result.accounts) || !result.accounts.every(account => usernameValid(account?.username)) || !Number.isInteger(result.accountCount) || result.accountCount < result.accounts.length) throw new Error('Could not read the account list. Try again.');
      accountCount = result.accounts.length;
      recoveryUsername.replaceChildren();
      for (const account of result.accounts) {
        const option = document.createElement('option');
        option.value = account.username;
        option.textContent = account.username;
        recoveryUsername.append(option);
      }
      if (!accountCount) {
        const option = document.createElement('option');
        option.textContent = 'No accounts to recover';
        option.value = '';
        recoveryUsername.append(option);
      }
      controls.hidden = false;
      status.textContent = `${result.accountCount} ${result.accountCount === 1 ? 'account' : 'accounts'} in this small beta.`;
    } catch (failure) {
      if (failure.status === 401 || failure.status === 403) accessFailure(failure.status);
      else { status.textContent = ''; error.textContent = failureMessage(failure); retry.hidden = false; }
    } finally { setBusy(false); }
  }

  async function createLink(body, recovery) {
    setBusy(true);
    resultPanel.hidden = true;
    link.value = '';
    status.textContent = recovery ? 'Creating a recovery link…' : 'Creating an invitation link…';
    try {
      const result = await repository.request('beta/invitations', body);
      const validKind = recovery ? result?.kind === 'recovery' : ['invite', 'invitation'].includes(result?.kind);
      const url = typeof result?.url === 'string' ? new URL(result.url, location.origin) : null;
      const parameters = url ? new URLSearchParams(url.hash.slice(1)) : null;
      const expiry = typeof result?.expiresAt === 'string' ? new Date(result.expiresAt) : new Date(NaN);
      if (!validKind || !url || url.origin !== location.origin || url.pathname !== '/join.html' || url.search || !parameters.get('token') || [...parameters.keys()].length !== 1 || !Number.isFinite(expiry.getTime())) throw new Error('Could not confirm the private link. Your entry is kept. Try again.');
      link.value = url.href;
      recoveryLink = recovery;
      document.getElementById('private-link-heading').textContent = recovery ? 'Send the recovery link' : 'Send the invitation';
      document.getElementById('private-link-instructions').textContent = recovery ? 'Choose Send recovery link, then choose how to send it to the account owner.' : 'Choose Send invitation, then choose a text message, email or another sharing option on your device.';
      send.textContent = recovery ? 'Send recovery link' : 'Send invitation';
      another.textContent = recovery ? 'Make an invitation' : 'Make another invitation';
      document.getElementById('private-link-expiry').textContent = `Expires ${new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(expiry)}.`;
      invitationStep.hidden = true;
      resultPanel.hidden = false;
      status.textContent = recovery ? 'Recovery link ready. Share it with the account owner.' : 'Invitation link ready. Share it with the intended person.';
    } catch (failure) {
      if (failure.status === 401 || failure.status === 403) accessFailure(failure.status);
      else { status.textContent = ''; error.textContent = failureMessage(failure); }
    } finally {
      setBusy(false);
      if (!resultPanel.hidden) send.focus();
    }
  }

  invitationForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    clearFeedback();
    const username = invitationUsername.value.trim().toLowerCase();
    if (username && !usernameValid(username)) { invalid(invitationUsername, usernameMessage); return; }
    invitationUsername.value = username;
    await createLink(username ? { username } : {}, false);
  });
  recoveryForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    clearFeedback();
    if (!accountCount || !usernameValid(recoveryUsername.value)) { invalid(recoveryUsername, 'Choose the existing account to recover.'); return; }
    await createLink({ recoveryFor: recoveryUsername.value }, true);
  });
  function shareText() {
    return recoveryLink
      ? 'Use this private My Words link to choose a new password for your existing account. Your saved words stay in that account. Please use it within 48 hours.'
      : 'You’re invited to My Words. Open this link to choose your own username and password. Please use it within 48 hours.';
  }
  async function copyLink(includeMessage = false) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Copy unavailable');
      await navigator.clipboard.writeText(includeMessage ? shareText() + '\n' + link.value : link.value);
      status.textContent = includeMessage ? 'Copied. Paste it into a text message or email to the intended person.' : 'Link copied. Share it only with the intended person.';
    } catch {
      document.getElementById('copy-options').open = true;
      link.focus();
      link.select();
      status.textContent = 'The link is selected. Use your device’s Copy command, then share it with the intended person.';
    }
  }
  document.getElementById('copy-private-link').addEventListener('click', async () => {
    if (busy || !link.value) return;
    clearFeedback(); setBusy(true);
    try { await copyLink(); } finally { setBusy(false); }
  });
  send.addEventListener('click', async () => {
    if (busy || !link.value) return;
    clearFeedback(); setBusy(true);
    try {
      if (!navigator.share) { await copyLink(true); return; }
      await navigator.share({ title: recoveryLink ? 'My Words password recovery' : 'Join My Words Beta', text: shareText(), url: link.value });
      status.textContent = 'Sharing options closed. You can use this same link again if you need to send it.';
    } catch (failure) {
      if (failure.name === 'AbortError') status.textContent = 'Your invitation is kept. Choose Send when you are ready.';
      else await copyLink(true);
    } finally { setBusy(false); }
  });
  another.addEventListener('click', () => {
    if (busy) return;
    clearFeedback(); link.value = ''; invitationUsername.value = '';
    invitationForm.querySelector('details').open = false;
    document.getElementById('copy-options').open = false;
    invitationStep.hidden = false; resultPanel.hidden = true;
    invitationForm.querySelector('button').focus();
  });
  retry.addEventListener('click', load);
  load();
})();
