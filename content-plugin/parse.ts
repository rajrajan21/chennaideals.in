export function parseFrontmatter(input: string) {
  return input
    .split('\n')
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const [key, ...rest] = line.split(':');
      if (!key) return acc;
      acc[key.trim()] = rest.join(':').trim();
      return acc;
    }, {});
}
