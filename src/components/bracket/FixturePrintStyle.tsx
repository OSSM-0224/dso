import React from 'react';

/**
 * Print-only page setup for the fixture chart.
 *
 * Rendered only by fixture screens (public bracket, published draw, preview)
 * so other printable views keep the browser's default page setup. The page
 * margin is zeroed here because the fixture sheet draws its own print-safe
 * padding (see `.print-sheet` in globals.css) — that also removes the
 * browser's URL/date header and gives a clean, framed PDF page.
 */
export const FixturePrintStyle: React.FC = () => (
  <style>{`
    @page { size: A4 landscape; margin: 0; }
  `}</style>
);
