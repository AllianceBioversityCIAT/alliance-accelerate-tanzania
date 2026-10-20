// AccelerateLogo — the ACCELERATE project mark, linked to the project site.
// Heads the "coalition behind ACCELERATE" section on home and /about.

import Image from 'next/image';
import { ACCELERATE_PROJECT } from '@/lib/content/partners';

export default function AccelerateLogo() {
  return (
    <a
      href={ACCELERATE_PROJECT.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="ACCELERATE project — opens in a new tab"
      className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <Image
        src={ACCELERATE_PROJECT.logo}
        alt={ACCELERATE_PROJECT.name}
        width={ACCELERATE_PROJECT.width}
        height={ACCELERATE_PROJECT.height}
        className="h-12 w-auto sm:h-14"
      />
    </a>
  );
}
