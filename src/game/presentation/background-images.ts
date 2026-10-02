/**
 * Every image dropped into src/game/assets/backgrounds/ becomes a backdrop option in the menu,
 * keyed by its file name (car.jpg → "car"). The procedural Hong Kong shader is always available too.
 */
const modules = import.meta.glob<string>('../assets/backgrounds/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export interface BackgroundImage {
  /** File stem, used as the stored menu value. */
  id: string;
  /** Human label shown in the menu and HUD. */
  name: string;
  url: string;
}

export const BACKGROUND_IMAGES: readonly BackgroundImage[] = Object.entries(modules)
  .map(([path, url]) => {
    const id = (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');
    const name = id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { id, name, url };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

/** Menu value: 'random', 'hong-kong' (procedural shader) or a BackgroundImage id. */
export type BackdropChoice = string;
export const RANDOM_BACKDROP = 'random';
export const PROCEDURAL_BACKDROP = 'hong-kong';

export function isKnownBackdrop(choice: string): boolean {
  return (
    choice === RANDOM_BACKDROP ||
    choice === PROCEDURAL_BACKDROP ||
    BACKGROUND_IMAGES.some((image) => image.id === choice)
  );
}
