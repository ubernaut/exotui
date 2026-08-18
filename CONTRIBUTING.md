Tui tries to follow [Deno Style Guide](https://deno.land/manual/contributing/style_guide), so please stick to it when
you want to contribute.

## Workflow

This project uses trunk-based development: branch from `main`, keep the change small and complete, and merge when the
checks pass. `plan/workflow/version-control.md` describes the loop and what has to be verified before a merge;
`plan/workflow/development.md` describes how a change is developed and checked.

Run `deno task health` before merging — it covers files the test suites do not reach, and its exit code is the signal,
not its output. Maintainer branches merge into `main` directly; there is no review thread, so the verification evidence
belongs in the commit message. If you are contributing from outside the repository, open a pull request instead — the
same gate applies to it.
