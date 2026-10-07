/**
 * about-gallery.ts — photos for the About page "The challenge" carousel.
 *
 * Files live in `public/about/gallery/`. Add, remove or reorder entries here;
 * the carousel renders whatever this array holds. Every photo needs an `alt`
 * that describes what is in it (screen readers read it aloud).
 */

export interface GalleryPhoto {
  /** Path under `public/`, starting with `/`. */
  src: string;
  /** Describes the photo's content — never empty, never "photo of…". */
  alt: string;
}

export const ABOUT_GALLERY: readonly GalleryPhoto[] = [
  {
    src: '/about/gallery/01.jpg',
    alt: 'Three ACCELERATE team members standing in front of tall stacks of grain sacks at a warehouse.',
  },
  {
    src: '/about/gallery/02.jpg',
    alt: 'Three people standing beside an agribusiness banner at the entrance of an office building.',
  },
  {
    src: '/about/gallery/03.jpg',
    alt: 'A group of partners standing around a community organisation banner outside its offices.',
  },
  {
    src: '/about/gallery/04.jpg',
    alt: 'ACCELERATE staff inspecting a tall sorghum field with farmers.',
  },
  {
    src: '/about/gallery/05.jpg',
    alt: 'Two field officers checking common bean plants in a wide green field.',
  },
];
