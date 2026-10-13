const KEY = 'liminal-sim-v1';
const MAX_ATTEMPTS = 20;

const valid = (a) => a && typeof a.meter === 'number' && a.tendencies && typeof a.tendencies === 'object';

export function createStore(storage) {
  function read() {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return { attempts: [] };
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.attempts)) return { attempts: [] };
      return { attempts: data.attempts.filter(valid) };
    } catch {
      return { attempts: [] };
    }
  }

  function write(data) {
    try {
      storage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  return {
    available() {
      try {
        storage.setItem('__liminal_probe', '1');
        storage.removeItem('__liminal_probe');
        return true;
      } catch {
        return false;
      }
    },
    attempts() {
      return read().attempts;
    },
    save(attempt) {
      const data = read();
      data.attempts.push(attempt);
      data.attempts = data.attempts.slice(-MAX_ATTEMPTS);
      return write(data);
    },
    clear() {
      try {
        storage.removeItem(KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}
