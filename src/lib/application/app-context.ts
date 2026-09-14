import { getContext, setContext } from 'svelte';
import type { AppController } from './app-controller.svelte';

const APP_CONTEXT = Symbol('birds-app-controller');

export function provideApp(controller: AppController) {
  setContext(APP_CONTEXT, controller);
}

export function useApp(): AppController {
  const controller = getContext<AppController>(APP_CONTEXT);
  if (!controller) throw new Error('AppController is not available in this component tree');
  return controller;
}
