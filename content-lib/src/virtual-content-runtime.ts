declare module 'virtual:content-runtime' {
  const content: Record<string, unknown>;
  export default content;
  export const collectionRoots: readonly string[];
}
