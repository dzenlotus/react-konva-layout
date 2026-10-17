import { createContext, useContext } from 'react';
import type { LayoutRegistry } from './model';
import type { LayoutContextValue } from './types';

export const RegistryContext = createContext<LayoutRegistry | null>(null);
export const ParentContext = createContext<string | null>(null);
export const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayout(): LayoutContextValue {
  const context = useContext(LayoutContext);
  if (!context) throw new Error('useLayout must be used inside Layout');
  return context;
}
