import { useState } from 'react';
import { isApiError, type ApiError, type FieldErrors } from './api';

/** Tracks loading plus field and form errors for one API-backed form. */
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');

  async function run<T>(fn: () => Promise<T>, onApiError?: (err: ApiError) => boolean): Promise<T | undefined> {
    setPending(true);
    setFieldErrors({});
    setFormError('');
    try {
      return await fn();
    } catch (err) {
      if (isApiError(err)) {
        if (onApiError?.(err)) return undefined;
        setFieldErrors(err.fields);
        if (!Object.keys(err.fields).length || err.code !== 'VALIDATION_ERROR') setFormError(err.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return { pending, fieldErrors, formError, setFormError, run };
}
