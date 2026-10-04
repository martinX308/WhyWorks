'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const requestGeneration = ++generation.current;
    try {
      const result = await api<T>(path);
      if (requestGeneration === generation.current) {
        setData(result);
        setError('');
      }
    } catch (e) {
      if (requestGeneration === generation.current) setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    let alive = true;
    setData(null);
    const tick = async () => {
      if (alive) await refresh();
    };
    void tick();
    const timer = setInterval(tick, document.hidden ? 10000 : 1000);
    return () => {
      alive = false;
      generation.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  return { data, error, refresh };
}
