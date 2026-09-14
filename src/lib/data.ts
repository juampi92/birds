export type Mode = 'sound-photo' | 'sound-name' | 'photo-name';
import catalog from '../../static/media/catalog.json';
export type MediaKind = 'song' | 'call' | 'drumming';

export type BirdImage = {
  id: string;
  url: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  creator: string;
  creatorUrl: string;
  license: string;
  licenseUrl: string;
  dimensions: string;
  identityNote: string;
};

export type PhotoCredit = {
  photographer: string;
  photographerUrl: string;
  source: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
};

export type MediaCredit = {
  id: string;
  kind: MediaKind;
  title: string;
  url: string;
  sourceUrl: string;
  recordist: string;
  license: string;
  licenseUrl: string;
};

export type Bird = {
  id: string;
  name: string;
  scientificName: string;
  images: BirdImage[];
  photoUrl: string;
  photoCredit: PhotoCredit;
  active: boolean;
  sounds: MediaCredit[];
};

export const birds: Bird[] = catalog.birds.map((entry) => {
  const images = entry.images.map((image) => ({
    id: image.id,
    url: image.url,
    title: image.title,
    imageUrl: image.imageUrl,
    sourceUrl: image.sourceUrl,
    creator: image.creator,
    creatorUrl: image.creatorUrl,
    license: image.license,
    licenseUrl: image.licenseUrl,
    dimensions: image.dimensions ?? '',
    identityNote: image.identityNote ?? ''
  }));
  const image = images[0];
  return {
    id: entry.id,
    name: entry.name,
    scientificName: entry.scientificName,
    images,
    active: true,
    photoUrl: image?.url ?? '',
    photoCredit: {
      photographer: image?.creator ?? '',
      photographerUrl: image?.creatorUrl ?? '',
      source: image?.title ?? '',
      sourceUrl: image?.sourceUrl ?? '',
      license: image?.license ?? '',
      licenseUrl: image?.licenseUrl ?? ''
    },
    sounds: entry.sounds.map((sound) => ({
      id: sound.id,
      kind: sound.kind as MediaKind,
      title: sound.title,
      url: sound.url,
      sourceUrl: sound.sourceUrl,
      recordist: sound.recordist,
      license: sound.license,
      licenseUrl: sound.licenseUrl
    }))
  };
});

export const modes: Mode[] = ['sound-photo', 'sound-name', 'photo-name'];
export const modeLabels: Record<Mode, string> = {
  'sound-photo': 'Sound → photo',
  'sound-name': 'Sound → name',
  'photo-name': 'Photo → name'
};

export function modeUsesSound(mode: Mode) {
  return mode.startsWith('sound-');
}
export function modeUsesPhoto(mode: Mode) {
  return mode.includes('photo');
}
export function modeUsesName(mode: Mode) {
  return mode.includes('name');
}
