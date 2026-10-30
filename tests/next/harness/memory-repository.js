// Injected test double only. Never accepted as evidence of PostgreSQL concurrency.
class MemoryRepository {
  constructor(workspaces) { this.states = structuredClone(workspaces); this.queue = Promise.resolve(); }
  async transaction(id, fn) {
    const task = this.queue.then(async () => {
      if (!this.states[id]) { const e = new Error('Access denied'); e.status = 403; throw e; }
      const state = structuredClone(this.states[id]);
      const result = await fn(state);
      if (this.failNext) { this.failNext = false; throw new Error('Test persistence failed'); }
      this.states[id] = state;
      return structuredClone(result);
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
module.exports = { MemoryRepository };
