/** Apply only the latest snapshot from the current authentication generation. */
export function createStateRefresh({ load, apply }) {
  let epoch = 0;

  return {
    invalidate() {
      epoch++;
    },
    async refresh() {
      const requested = ++epoch;
      let snapshot;
      try {
        snapshot = await load();
      } catch (error) {
        // A previous account's failed request must not become the current UI's error.
        if (requested !== epoch) return false;
        throw error;
      }
      if (requested !== epoch) return false;
      // Keep application synchronous so no later request can interleave this commit.
      apply(snapshot);
      return true;
    },
  };
}
