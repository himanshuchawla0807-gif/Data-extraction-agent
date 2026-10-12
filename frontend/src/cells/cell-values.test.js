import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TextCell from './TextCell';
import NumberCell from './NumberCell';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(() => { if (root) act(() => root.unmount()); document.body.innerHTML = ''; });

describe('extracted value rendering and editing', () => {
  for (const Component of [TextCell, NumberCell]) {
    for (const value of [0, false, { value: 0 }, { value: false }]) {
      it(`${Component.name} preserves ${JSON.stringify(value)}`, () => {
        const container = document.createElement('div'); document.body.append(container);
        root = createRoot(container);
        act(() => root.render(React.createElement(Component, { initialValue: value, columnId: 'fixture', rowIndex: 0, dataDispatch: vi.fn() })));
        expect(container.textContent).toContain(String(typeof value === 'object' ? value.value : value));
      });
    }
    it(`${Component.name} edits untrusted markup as plain text`, () => {
      const container = document.createElement('div'); document.body.append(container);
      root = createRoot(container);
      act(() => root.render(React.createElement(Component, { initialValue: '<img src=x onerror=alert(1)>', columnId: 'fixture', rowIndex: 0, dataDispatch: vi.fn() })));
      act(() => container.querySelector('.data-input').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
      expect(container.querySelector('input')).not.toBeNull();
      expect(container.querySelector('img')).toBeNull();
    });
  }
});
