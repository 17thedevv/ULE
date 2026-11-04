import { useEffect, useState } from 'react';
import { fetchGoogleLoginAvailability } from '../../services/auth';

export function useGoogleLoginAvailable(attempt = 0): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (import.meta.env.VITE_GOOGLE_LOGIN_ENABLED !== 'true') return;

    let current = true;
    void fetchGoogleLoginAvailability().then(
      (enabled) => {
        if (current) setAvailable(enabled);
      },
      () => {
        if (current) setAvailable(false);
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  return available;
}
