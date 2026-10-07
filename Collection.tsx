export class Collection<T> {
  private readonly values: T[];

  constructor(values: T[] = []) {
    this.values = values;
  }

  toArray(): T[] {
    return [...this.values];
  }
}
