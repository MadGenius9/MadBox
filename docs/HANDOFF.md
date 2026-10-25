# MadBox delivery and setup handoff

## Open the game

The cloud development server responds on port 5173 and the production server on port 5174. Both returned HTTP 200 with the MadBox title during handoff verification. These addresses are internal to the cloud machine. No supported public preview or port-forwarding capability is exposed to this task, so a localhost address on your own computer would not reach those cloud processes.

The portable bundle is `release/MadBox.zip`. It includes source, the compiled game, the dependency lockfile, tests, documentation, and selected validation evidence. It excludes Git metadata, dependencies, caches, and credentials.

The intended source repository is `https://github.com/MadGenius9/MadBox`, with delivery on `main`. After the source commit has been pushed, play on your own computer with Node.js 22.12 or later:

```sh
git clone https://github.com/MadGenius9/MadBox.git
cd MadBox
npm ci
npm run dev -- --host 127.0.0.1 --open
```

For the preserved portable bundle, extract it, open a terminal in its `MadBox` folder, and run:

```sh
npm ci
npm run preview -- --host 127.0.0.1 --open
```

The second command serves the included production build and opens your computer's default browser. It does not publish the game externally. For development, use `npm run dev -- --host 127.0.0.1 --open` instead. If your browser does not open automatically, use the address printed by Vite on that same computer.

## Repository state

- Existing checkout: `/workspace/MadBox`, origin `MadGenius9/MadBox` on GitHub.
- Delivery branch: `main`.
- One working tree; no additional Git worktrees were created.
- Source, lockfile, necessary assets, tests, and documentation are versioned in Git.
- Dependencies, build outputs, browser evidence, caches, and the local portable archive are excluded from Git.

The portable bundle is a preserved local artifact from before the Git commit; its included handoff notes describe that earlier repository state. Once the source push is complete, use the GitHub repository for the current source and documentation. A Git clone does not include the ignored portable archive or generated browser evidence. The GitHub delivery step requires a successful, verified push; a local commit alone does not establish remote availability.

## Environment configuration

The environment draft contains the tested installation script and startup instructions, with the checkout mounted at `MadBox`. The source can be cloned and run independently of environment publication.

The remaining product action is to open this environment's settings, review the saved installation/startup instructions and repository entry, save those settings, then select Publish for the prepared environment. Publication captures the prepared filesystem for future tasks; live server processes must be restarted. The available configuration tools save drafts but do not publish them, and this task has not verified restoration in a new task. No additional secrets, network destinations, or access grants are required.

## Validation and remaining assessment

All 55 automated tests, the production build, desktop/mobile controls, touch navigation, save/load, and a sustained browser run passed. No unresolved functional failure was found in those checks.

The sustained run covered 30 simulated minutes at 10× speed in 190.323 wall seconds with automated interactions. It was not 30 minutes of human interactive play. It finished with 576 creatures, three kingdoms, 180 buildings, and no page errors. Hardware GPU performance, subjective graphics superiority, and long-session human enjoyment remain unverified. See `VALIDATION.md` for the complete evidence and software-rendering limitations.
