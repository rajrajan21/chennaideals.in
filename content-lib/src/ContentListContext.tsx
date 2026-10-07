import { createContext, useContext } from 'react';

export type ContentListContextValue = Record<string, unknown> | null;

export const ContentListContext = createContext<ContentListContextValue>(null);

export function useContentListContext() {
  return useContext(ContentListContext);
}
