import { runNode, runSteps } from '../utils/run-step.mjs';

await runSteps([
  {
    label: 'Download reviewed photographs',
    task: () => runNode('scripts/media/download-images.mjs')
  },
  {
    label: 'Download reviewed recordings',
    task: () => runNode('scripts/media/download-sounds.mjs')
  },
  { label: 'Validate reviewed media', task: () => runNode('scripts/media/validate-media.mjs') },
  {
    label: 'Generate the media manifest',
    task: () => runNode('scripts/media/generate-media-manifest.mjs')
  }
]);
