export default function formatOverridesPlugin() {
  return {
    name: 'format-overrides-plugin',
    enforce: 'pre',
    transform(code: string) {
      return code;
    },
  };
}
