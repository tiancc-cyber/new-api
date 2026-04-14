/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { useEffect, useRef, useState } from 'react';

/**
 * Detect container size (width/height) via ResizeObserver.
 * @returns {[ref, size]} ref and { width, height }
 */
export const useContainerSize = () => {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const rafIdRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      // getBoundingClientRect() can return fractional pixels.
      // Semi Table scroll.y is very sensitive to tiny height changes and can
      // trigger a resize -> re-layout -> resize feedback loop (visual jitter).
      // Round to integer pixels to stabilize layout across browsers.
      const next = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      setSize((prev) => {
        // ResizeObserver can fire frequently (sub-pixel / layout jitter).
        // Only update state when size truly changes to avoid render loops.
        const EPS = 1; // px
        if (
          Math.abs(prev.width - next.width) < EPS &&
          Math.abs(prev.height - next.height) < EPS
        ) {
          return prev;
        }
        return next;
      });
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      // Fallback: update once; callers may still get correct initial height.
      return;
    }

    const ro = new ResizeObserver(() => {
      // Batch potential resize storms into a single paint.
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = 0;
        update();
      });
    });

    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    };
  }, []);

  return [ref, size];
};

