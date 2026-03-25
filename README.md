# IPL Predictor with Supabase

This version uses Supabase as the shared backend.

## Pages
- `index.html` -> voters page
- `admin.html` -> admin page

## Features
- shared leaderboard
- multiple matches per day
- add users with PINs
- add matches manually or with JSON upload
- update match results
- votes stored centrally in Supabase

## Before deploying
This build already includes the Supabase URL and anon key you provided.

## GitHub Pages deployment
Upload these files to your GitHub Pages repo root:
- index.html
- admin.html
- styles.css
- script.js

## Important note about security
This app uses the public anon key, which is normal for Supabase frontend apps. But you should set up Row Level Security policies in Supabase so the public app can only do what you want.

The current frontend expects:
- users can read matches/users/leaderboard data
- users can insert or update their own votes after PIN validation in the browser
- admin page can insert users and matches and update results

For stronger protection later, the admin page should move behind auth or a simple Edge Function.
