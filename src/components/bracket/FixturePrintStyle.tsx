import React from 'react';

/**
 * Print-only page setup for the fixture chart.
 *
 * Rendered only by fixture screens (public bracket, published draw, preview)
 * so other printable views keep the browser's default page setup. Landscape
 * gives the round columns enough width to fit on one sheet.
 */
export const FixturePrintStyle: React.FC = () => (
  <style>{`
    @media print {
      @page { size: A4 landscape; margin: 8mm; }
    }
  `}</style>
);
