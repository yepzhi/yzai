# Deployment Rule for YZAI

Whenever any modification is made to the codebase (HTML, CSS, JS, scripts, or configs):
Always execute the complete deployment pipeline:
1. `npm run build` (sync all build subdirectories)
2. `git add -A && git commit -m "..." && git push origin main` (push changes to GitHub)
3. `ssh yzai "cd /home/yepzhi/yzai && git pull"` (update the live Nginx Docker mount on the server)
4. `npx -y wrangler pages deploy . --project-name yzai --branch main` (deploy immediately to Cloudflare Pages)

Alternatively, run:
`npm run deploy`
