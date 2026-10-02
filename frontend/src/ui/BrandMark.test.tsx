import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { BrandMark } from './BrandMark';

vi.mock('react-native', () => {
  const native = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(name, props, children as React.ReactNode);
    Component.displayName = name;
    return Component;
  };

  return {
    StyleSheet: { create: (styles: unknown) => styles },
    Text: native('Text'),
    View: native('View')
  };
});

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      interactivePrimary: '#B42318',
      textInverse: '#FFFFFF',
      textPrimary: '#24211F',
      textSecondary: '#6B6560'
    }
  })
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renderBrand = (element: React.ReactElement) => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  return renderer.root;
};

describe('BrandMark', () => {
  it('renders the horizontal color logo by default', () => {
    const root = renderBrand(<BrandMark />);

    expect(root.findByProps({ testID: 'brand-logo-horizontal-color' })).toBeDefined();
    expect(root.findByProps({ accessibilityLabel: 'Crispy Bite' })).toBeDefined();
  });

  it('uses the app icon when compact space is requested', () => {
    const root = renderBrand(<BrandMark compact />);

    expect(root.findByProps({ testID: 'brand-logo-icon' })).toBeDefined();
  });

  it('renders the monochrome wordmark for receipt output', () => {
    const root = renderBrand(<BrandMark variant="monochrome" />);

    expect(root.findByProps({ testID: 'brand-logo-horizontal-monochrome' })).toBeDefined();
  });
});
