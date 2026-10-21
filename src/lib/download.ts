import { ApiError } from './api';

function csrf() {
  const m = document.cookie.split('; ').find((c) => c.startsWith('csrf_token='));
  return m ? decodeURIComponent(m.slice('csrf_token='.length)) : '';
}

/** POSTs to the API and saves the file it returns (posters, PDFs). */
export async function downloadFrom(path: string, body: unknown, fallbackName: string, open = false) {
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new ApiError(res.status, err?.error?.code ?? 'DOWNLOAD_FAILED', err?.error?.message ?? 'The download failed. Please try again.');
  }
  const blob = await res.blob();
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  if (open) {
    window.open(url, '_blank', 'noopener');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
