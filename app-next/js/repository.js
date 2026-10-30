(function (root) {
  class Repository {
    async request(path, body) {
      // A stalled connection must reach the existing owned offline fallback.
      // Bound session and generation only; never cancel in-flight owned saves.
      const quickWords = /^workspaces\/[^/]+\/quick-words$/.test(path);
      const controller = path === 'session' || quickWords ? new AbortController() : null;
      // Initial generation can make two 45-second calls for incomplete output.
      const timeout = controller ? setTimeout(() => controller.abort(), quickWords ? 100000 : 10000) : null;
      try {
        const response = await fetch('/api/' + path, { credentials: 'same-origin', cache: 'no-store', method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json', 'x-next-csrf': this.csrf || '' } : {}, body: body ? JSON.stringify(body) : undefined, ...(controller ? { signal: controller.signal } : {}) });
        const result = await response.json();
        if (!response.ok) { const error = new Error(result.error || 'Request failed'); error.status = response.status; throw error; }
        return result;
      } catch (error) {
        if (controller?.signal.aborted) throw new Error(quickWords ? 'Words took too long. Your entry and earlier words are kept. Try again.' : 'Sign-in check took too long. Please try again.');
        throw error;
      } finally { if (timeout !== null) clearTimeout(timeout); }
    }
    async session() { const s = await this.request('session'); this.csrf = s.csrf; return s; }
    async signIn(name, password) { await this.session(); const s = await this.request('sign-in', { name, password }); this.csrf = s.csrf; return s; }
  }
  root.NextRepository = Repository;
})(globalThis);
