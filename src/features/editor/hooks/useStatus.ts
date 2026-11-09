import { useCallback, useState } from 'react';
import { STATUS_MESSAGES } from '../statusMessages';

export function useStatus() {
  const [status, setStatus] = useState<string>(STATUS_MESSAGES.ready);

  const setStatusMessage = useCallback((message: string) => {
    setStatus(message);
  }, []);

  const applyOptionalStatus = useCallback((message: string | null) => {
    if (message) {
      setStatus(message);
    }
  }, []);

  return {
    status,
    setStatusMessage,
    applyOptionalStatus,
  };
}
