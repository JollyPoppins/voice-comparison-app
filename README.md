# Voice Provider Comparison

A standalone web app for evaluating HappyRobot vs Phenom voice AI calls. No Cursor account needed — works in any browser.

## Deploy to Vercel (free, 2 minutes)

1. **Push to GitHub**
   ```bash
   cd voice-comparison-app
   git init
   git add .
   git commit -m "initial commit"
   # create a new repo at github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/voice-comparison-app.git
   git push -u origin main
   ```

2. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New Project**
   - Select your `voice-comparison-app` repository
   - Framework: **Vite** (auto-detected)
   - Click **Deploy** — done

3. **Share the link**
   Vercel gives you a permanent URL like `https://voice-comparison-app.vercel.app`. Share it with anyone — no account needed to use it.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Notes

- All evaluation data is stored in the browser's **localStorage** — each user's data is local to their browser.
- Evaluations survive page refresh but are per-browser (not shared across users).
- Use **Export CSV** on the Results tab to download your data.
