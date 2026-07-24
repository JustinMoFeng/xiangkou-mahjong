# Project Agent Rules

- Work on the `xc_dev` branch for agent changes in this repository.
- Do not manually deploy. Deployment must happen only through the configured CI/CD flow after code is merged.
- Do not create a merge request / pull request unless the user explicitly asks for one.
- Before creating a merge request, first merge the latest `dev` into `xc_dev` and resolve any conflicts with user confirmation when the resolution is not obvious.
- When the user asks to create a merge request, push `xc_dev`, then merge `xc_dev` into `dev`, and create the merge request from `dev` to `main`.
- Keep `main` as the protected production branch. It should be updated through merge requests only.
- Preserve the Tencent EdgeOne deployment flow. Do not switch deployment back to GitHub Pages unless the user explicitly asks.
