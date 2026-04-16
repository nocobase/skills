# Workspaces

Each subdirectory is a NocoBase system draft, git-tracked for version management.

```
workspaces/
├── pm/                  # Project Management (active build)
│   ├── collections/
│   ├── pages/
│   ├── templates/
│   ├── routes.yaml
│   └── state.yaml       # auto-generated after deploy
└── hrm/                 # HR Management (another system)
```

## Workflow

```bash
# Build → deploy → export → diff
cd <skill-dir>/src
npx tsx cli/cli.ts deploy-project ../workspaces/pm --group "PM" --force

# After deploy, export to compare
npx tsx cli/cli.ts export-project "PM" ../workspaces/pm-export

# Git diff to see what changed
git diff workspaces/pm/
```

## Version management

Each deploy updates `state.yaml`. Commit after each successful deploy to create checkpoints:
```bash
git add workspaces/pm/ && git commit -m "PM: round 1 deployed"
```

Roll back: `git checkout HEAD~1 -- workspaces/pm/` then re-deploy.
