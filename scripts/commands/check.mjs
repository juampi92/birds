import { runNode, runSteps, runTool } from '../utils/run-step.mjs';

await runSteps([
  {
    label: 'Generate the media manifest',
    task: () => runNode('scripts/media/generate-media-manifest.mjs')
  },
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
