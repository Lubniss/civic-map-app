// Supabase Edge Function "api": runs the same Express API as server/ (phase 7, no separate host needed).
// The compiled server (server/dist → ./server) is copied in by `npm run edge:build` in server/.
//
// Requests arrive as /api/<route> (the function name is part of the path), so the app is mounted at /api.
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to every function automatically;
// ORS_API_KEY is set once with `supabase secrets set`.
import express from 'express';
import { createApp } from './server/app.js';

const root = express();
root.disable('x-powered-by');
root.use('/api', createApp());
root.listen(8000);
