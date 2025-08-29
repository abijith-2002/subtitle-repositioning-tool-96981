# Subtitle Repositioning Frontend (React)

This app provides the UI for uploading a video and subtitle file, monitoring processing progress, previewing results, and downloading the processed subtitle from the backend FastAPI service.

## Features
- Upload video and subtitle files
- Create a processing job
- Poll job status and progress
- Show preview data (if the backend exposes it)
- Download the processed subtitle file
- Light/Dark theme toggle

## Configure Backend URL
Create a `.env` file in this directory and set:
```
REACT_APP_BACKEND_URL=http://localhost:8000
```
If the frontend is served from the same origin as the backend (e.g., via a reverse proxy), you can leave it empty.

See `.env.example` for reference.

## Scripts
- `npm start` - start development server
- `npm test` - run tests
- `npm run build` - production build

## Expected Backend Endpoints
The UI integrates with these endpoints (paths are relative to `REACT_APP_BACKEND_URL`):
- `POST /api/jobs` - multipart form with fields `video` and `subtitle`, returns `{ job_id }`
- `GET /api/jobs/{job_id}` - returns `{ status, progress, error?, result? }`
- `GET /api/jobs/{job_id}/download` - returns processed file (as attachment)
- `GET /api/jobs/{job_id}/preview` (optional) - returns preview data for UI display

Adjust `src/api.js` if your backend uses different paths.
