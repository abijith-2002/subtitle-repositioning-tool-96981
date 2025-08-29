import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { createJob, getJob, getPreview, downloadResult } from './api';

// Simple styles for layout additions (reusing CSS variables)
const containerStyle = {
  maxWidth: 980,
  margin: '0 auto',
  padding: '24px'
};
const cardStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16
};
const labelStyle = { display: 'block', fontWeight: 600, marginBottom: 8 };
const rowStyle = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' };
const btnStyle = {
  backgroundColor: 'var(--button-bg)',
  color: 'var(--button-text)',
  border: 'none',
  borderRadius: 8,
  padding: '10px 16px',
  cursor: 'pointer',
  fontWeight: 600
};

// PUBLIC_INTERFACE
function App() {
  const [theme, setTheme] = useState('light');

  // Upload state
  const [videoFile, setVideoFile] = useState(null);
  const [subtitleFile, setSubtitleFile] = useState(null);

  // Job state
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [resultInfo, setResultInfo] = useState(null);
  const [preview, setPreview] = useState(null);

  const pollingRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const canSubmit = useMemo(() => {
    return Boolean(videoFile) && Boolean(subtitleFile) && !jobId;
  }, [videoFile, subtitleFile, jobId]);

  const resetJobState = () => {
    setJobId('');
    setStatus('');
    setProgress(0);
    setError('');
    setResultInfo(null);
    setPreview(null);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    setError('');
    setResultInfo(null);
    setPreview(null);

    try {
      const resp = await createJob({ videoFile, subtitleFile });
      const newJobId = resp.job_id || resp.jobId || resp.id;
      if (!newJobId) {
        throw new Error('Backend did not return job_id.');
      }
      setJobId(newJobId);
      setStatus('queued');
      setProgress(0);

      // Start polling
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        try {
          const data = await getJob(newJobId);
          if (data.status) setStatus(data.status);
          if (typeof data.progress === 'number') setProgress(data.progress);
          if (data.error) setError(data.error);
          if (data.result) setResultInfo(data.result);

          if (data.status === 'completed') {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
            // Try fetch preview if supported
            getPreview(newJobId).then(setPreview).catch(() => {});
          }
          if (data.status === 'failed') {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } catch (err) {
          console.error(err);
          setError(err.message || 'Failed to fetch job status.');
        }
      }, 1500);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create job.');
    }
  };

  const handleDownload = async () => {
    try {
      const { blob, fileName } = await downloadResult(jobId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `processed_${jobId}.ass`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Download failed.');
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return (
    <div className="App">
      <header className="App-header" style={{ alignItems: 'stretch' }}>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>

        <div style={containerStyle}>
          <h1 style={{ marginTop: 0 }}>Subtitle Repositioning Tool</h1>
          <p className="description" style={{ color: 'var(--text-secondary)' }}>
            Upload a video and its subtitle to reposition overlapping subtitles away from burnt-in text.
          </p>

          <section style={cardStyle} aria-label="Upload form">
            <h2 style={{ marginTop: 0 }}>1. Upload files</h2>
            <form onSubmit={handleCreateJob}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle} htmlFor="video-input">Video file</label>
                <input
                  id="video-input"
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle} htmlFor="subtitle-input">Subtitle file (.srt, .ass, .ssa, .vtt)</label>
                <input
                  id="subtitle-input"
                  type="file"
                  accept=".srt,.ass,.ssa,.vtt,text/vtt,application/x-subrip"
                  onChange={(e) => setSubtitleFile(e.target.files?.[0] || null)}
                />
              </div>
              <div style={rowStyle}>
                <button type="submit" style={btnStyle} disabled={!canSubmit}>
                  Create Job
                </button>
                <button
                  type="button"
                  onClick={resetJobState}
                  style={{ ...btnStyle, backgroundColor: '#6c757d' }}
                >
                  Reset
                </button>
              </div>
            </form>
            {!canSubmit && !jobId && (
              <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                Select both a video and a subtitle file to enable submission.
              </p>
            )}
          </section>

          <section style={cardStyle} aria-label="Job status">
            <h2 style={{ marginTop: 0 }}>2. Job status</h2>
            {jobId ? (
              <>
                <div style={{ marginBottom: 8 }}>
                  <strong>Job ID:</strong> {jobId}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Status:</strong> {status || 'unknown'}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Progress:</strong> {progress}% 
                  <div style={{
                    width: '100%',
                    height: 10,
                    background: 'var(--border-color)',
                    borderRadius: 6,
                    marginTop: 6
                  }}>
                    <div style={{
                      width: `${Math.min(Math.max(progress, 0), 100)}%`,
                      height: '100%',
                      background: 'var(--text-secondary)',
                      borderRadius: 6,
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
                {error && (
                  <div style={{ color: '#d9534f', marginTop: 8 }}>
                    <strong>Error:</strong> {error}
                  </div>
                )}
              </>
            ) : (
              <p>No active job. Create a job after uploading files.</p>
            )}
          </section>

          <section style={cardStyle} aria-label="Result and preview">
            <h2 style={{ marginTop: 0 }}>3. Result & preview</h2>
            {status === 'completed' ? (
              <>
                {preview ? (
                  <div style={{ marginBottom: 12 }}>
                    <strong>Preview:</strong>
                    <div style={{
                      marginTop: 8,
                      padding: 12,
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      textAlign: 'left',
                      background: 'var(--bg-primary)'
                    }}>
                      {preview.before_after ? (
                        <>
                          <div style={{ marginBottom: 8 }}>
                            <em>Before:</em>
                            <pre style={{ whiteSpace: 'pre-wrap' }}>
                              {JSON.stringify(preview.before_after.before, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <em>After:</em>
                            <pre style={{ whiteSpace: 'pre-wrap' }}>
                              {JSON.stringify(preview.before_after.after, null, 2)}
                            </pre>
                          </div>
                        </>
                      ) : (
                        <pre style={{ whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(preview, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-secondary)' }}>
                    No preview available. You can still download the processed file.
                  </p>
                )}
                <div style={rowStyle}>
                  <button onClick={handleDownload} style={btnStyle}>
                    Download Processed Subtitle
                  </button>
                </div>
                {resultInfo && resultInfo.filename && (
                  <p style={{ marginTop: 8 }}>
                    Output file: <strong>{resultInfo.filename}</strong>
                  </p>
                )}
              </>
            ) : (
              <p>Result will be available after processing completes.</p>
            )}
          </section>

          <footer style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 24 }}>
            Backend URL: {process.env.REACT_APP_BACKEND_URL || '(same origin)'}
          </footer>
        </div>
      </header>
    </div>
  );
}

export default App;
