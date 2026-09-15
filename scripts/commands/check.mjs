import { runSteps, runTool } from '../utils/run-step.mjs';

await runSteps([
  {
    label: 'Svelte and TypeScript diagnostics',
    task: () =>
      runTool('svelte-kit', ['sync']).then(() =>
        runTool('svelte-check', ['--tsconfig', './jsconfig.json'])
      )
  },
  { label: 'ESLint', task: () => runTool('eslint', ['.']) },
  { label: 'Formatting', task: () => runTool('prettier', ['--check', '.']) },
  {
    label: 'Application tests',
    task: () => runTool('vitest', ['run', 'src', 'scripts/tests/offline-client.test.mjs'])
  }
]);
