import { runNode, runSteps, runTool } from '../utils/run-step.mjs';

await runSteps([
  { label: 'Validate reviewed media', task: () => runNode('scripts/media/validate-media.mjs') },
  {
    label: 'Generate the media manifest',
    task: () => runNode('scripts/media/generate-media-manifest.mjs')
  },
  {
    label: 'Validate the generated media manifest',
    task: () => runNode('scripts/media/validate-media-manifest.mjs')
  },
  { label: 'Build the application', task: () => runTool('vite', ['build']) }
]);
