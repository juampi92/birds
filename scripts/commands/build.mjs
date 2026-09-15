import { runNode, runSteps, runTool } from '../utils/run-step.mjs';

await runSteps([
  { label: 'Validate reviewed media', task: () => runNode('scripts/media/validate-media.mjs') },
  {
    label: 'Validate the committed media manifest',
    task: () => runNode('scripts/media/validate-media-manifest.mjs')
  },
  { label: 'Build the application', task: () => runTool('vite', ['build']) }
]);
