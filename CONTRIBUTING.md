Tui tries to follow [Deno Style Guide](https://deno.land/manual/contributing/style_guide), so please stick to it when
you want to contribute.

## Workflow

This project uses trunk-based development: branch from `main`, keep the change small and complete, open a pull request,
and merge when the checks pass. `plan/workflow/version-control.md` describes the loop and what has to be verified before
a merge; `plan/workflow/development.md` describes how a change is developed and checked. Run `deno task health` before
opening the pull request — it covers files the test suites do not reach.
