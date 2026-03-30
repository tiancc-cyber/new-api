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

import React from 'react';

/**
 * PageContainer
 * - Unifies common page spacing under the fixed header bar.
 * - Keeps system background (body uses --semi-color-bg-0).
 *
 * Notes:
 * - Uses safe-area inset for iOS notch.
 * - Default values match the /tutorial page.
 */
const PageContainer = ({
  children,
  className = '',
  style,
  topOffsetPx = 72,
  maxWidthClassName = '',
  edgePaddingClassName = 'px-2',
}) => {
  return (
    <div
      className={`${edgePaddingClassName} ${maxWidthClassName} ${className}`.trim()}
      style={{
        paddingTop: `calc(${topOffsetPx}px + env(safe-area-inset-top))`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default PageContainer;

