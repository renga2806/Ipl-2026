# IPL Predictor - zero-cost MVP

A simple single-page app for daily IPL match prediction tracking.

## What it does
- Shows a leaderboard at the top
- Lets participants submit one vote per match using their name + PIN
- Lets admin create today's match
- Lets admin mark the winner or abandoned/no-result
- Automatically awards points
- Stores everything in browser localStorage, so no backend cost

## Rules implemented
- Correct prediction = 1 point
- Abandoned/no-result = everyone who submitted gets 1 point
- No vote = 0 points

## How to run
Just open `index.html` in a browser.

## Best free hosting options
- GitHub Pages
- Netlify
- Vercel

## Important limitation
This version stores data only in the browser where it is used. That means:
- If you open it on another phone/laptop, the data will not be there
- If browser storage is cleared, data is gone

## Best next upgrade
Move storage to Supabase for a proper free cloud backend so everybody sees the same shared data.
