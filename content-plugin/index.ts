export default {
  name: 'content-plugin',
  transform(code: string) {
    if (!code.includes('virtual-content-runtime')) {
      return null;
    }
    return { code, map: null };
  },
};
