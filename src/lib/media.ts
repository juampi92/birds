import { base } from '$app/paths';
import type { Bird } from '$lib/data';
import type { SessionQuestion } from '$lib/engine';

export function assetUrl(url: string) {
  return url.startsWith('http') ? url : `${base}${url}`;
}

export function sourceNameFor(url: string) {
  if (!url) return 'Source';
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (hostname === 'commons.wikimedia.org') return 'Wikimedia Commons';
    if (hostname === 'xeno-canto.org') return 'Xeno-canto';
    return hostname.replace(/\.[^.]+$/, '').replaceAll('-', ' ');
  } catch {
    return 'Source';
  }
}

export function photoFor(bird: Bird, imageId?: string | null) {
  return bird.images.find((image) => image.id === imageId) ?? bird.images[0] ?? null;
}

export function selectedPhoto(question: SessionQuestion | undefined) {
  return question ? photoFor(question.bird, question.imageId) : null;
}

export function photoReady(bird: Bird, imageId?: string | null) {
  return Boolean(photoFor(bird, imageId)?.url);
}

export function sourceFor(question: SessionQuestion | undefined) {
  return question?.bird.sounds.find((sound) => sound.id === question.soundId);
}

export function photoCreditFor(question: SessionQuestion | undefined) {
  const image = selectedPhoto(question);
  return {
    photographer: image?.creator ?? question?.bird.photoCredit.photographer ?? 'Source contributor',
    photographerUrl: image?.creatorUrl ?? question?.bird.photoCredit.photographerUrl ?? '',
    source: image?.title ?? question?.bird.photoCredit.source ?? 'source',
    sourceUrl: image?.sourceUrl ?? question?.bird.photoCredit.sourceUrl ?? '',
    license: image?.license ?? question?.bird.photoCredit.license ?? 'licence',
    licenseUrl: image?.licenseUrl ?? question?.bird.photoCredit.licenseUrl ?? '',
    identityNote: image?.identityNote ?? ''
  };
}
