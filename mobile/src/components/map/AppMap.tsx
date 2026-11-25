// Type-checking and fallback entry. At runtime Metro picks AppMap.android.tsx or AppMap.ios.tsx instead,
// so screens import only `AppMap` from here and the shared types from './types'.
export { AppMap } from './AppMap.ios';
