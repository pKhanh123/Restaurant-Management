import React from 'react';
import { Platform } from 'react-native';

const motion = `
  @media (prefers-reduced-motion: no-preference) {
    @keyframes crispy-enter {
      from { transform: translateY(6px); opacity: .8; }
      to { transform: translateY(0); opacity: 1; }
    }
    [data-enter="login"] { animation: crispy-enter 240ms ease-out both; }
  }
  @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
    [data-interaction]:not([aria-disabled="true"]) {
      transition: transform 160ms ease-out;
    }
    [data-interaction]:not([aria-disabled="true"]):hover { transform: translateY(-2px); }
    [data-interaction]:not([aria-disabled="true"]):active { transform: translateY(1px); }
    [data-interaction="menu-card"] img { transition: transform 180ms ease-out; }
    [data-interaction="menu-card"]:not([aria-disabled="true"]):hover img { transform: scale(1.025); }
  }
`;

export function WebPresentation() {
  return Platform.OS === 'web' ? <style>{motion}</style> : null;
}
