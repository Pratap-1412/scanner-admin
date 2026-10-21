import { useEffect, useState } from 'react';

/**
 * The value, but only after it has stopped changing for `ms`. Used for searches that
 * hit the API, so typing "paneer" sends one request instead of six.
 */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
