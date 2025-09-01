//
// API utility for interacting with the subtitle_backend.
//
const DEFAULT_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Build fully-qualified URL from a relative path against backend base.
 */
function url(path) {
  // Allow absolute URLs to pass through (e.g., http:// or https://)
  if (/^https?:\/\//i.test(path)) return path;
  return `${DEFAULT_BASE_URL}${path}`;
}

/**
 * Convert Fetch responses to JSON with error handling.
 */
async function toJsonOrThrow(resp) {
  const contentType = resp.headers.get('content-type') || '';
  let data = null;
  try {
    if (contentType.includes('application/json')) {
      data = await resp.json();
    } else {
      const text = await resp.text();
      data = { message: text };
    }
  } catch (e) {
    data = { message: 'Failed to parse server response.' };
  }
  if (!resp.ok) {
    const err = new Error(data?.detail || data?.message || `HTTP ${resp.status}`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * PUBLIC_INTERFACE
 * Create a processing job by uploading video and subtitle.
 * Returns: { job_id, message? }
 */
export async function createJob({ videoFile, subtitleFile }) {
  /** Create job by posting multipart/form-data to backend. */
  const form = new FormData();
  if (videoFile) form.append('video', videoFile);
  if (subtitleFile) form.append('subtitle', subtitleFile);

  const resp = await fetch(url('/api/jobs'), {
    method: 'POST',
    body: form
  });
  return toJsonOrThrow(resp);
}

/**
 * PUBLIC_INTERFACE
 * Get job status/progress by jobId.
 * Example response:
 * { job_id, status: 'queued'|'processing'|'completed'|'failed', progress: 0-100, error?: string, result?: { filename, url? } }
 */
export async function getJob(jobId) {
  const resp = await fetch(url(`/api/jobs/${encodeURIComponent(jobId)}`));
  return toJsonOrThrow(resp);
}

/**
 * PUBLIC_INTERFACE
 * Get preview data for a job if backend supports it.
 * Fallback: returns null if not available.
 */
export async function getPreview(jobId) {
  try {
    const resp = await fetch(url(`/api/jobs/${encodeURIComponent(jobId)}/preview`));
    if (resp.status === 404) return null;
    return toJsonOrThrow(resp);
  } catch {
    return null;
  }
}

/**
 * PUBLIC_INTERFACE
 * Download processed file for a job. Returns Blob.
 */
export async function downloadResult(jobId) {
  const resp = await fetch(url(`/api/jobs/${encodeURIComponent(jobId)}/download`), {
    method: 'GET'
  });
  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(text || `Download failed with status ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  const blob = await resp.blob();
  // Try file name from header if provided
  const disposition = resp.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  const suggestedName = match ? decodeURIComponent(match[1]) : `processed_${jobId}`;
  return { blob, fileName: suggestedName };
}
