export default function asyncify<T>(
  syncFunction: (...args: unknown[]) => T,
  ...args: unknown[]
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      const result = syncFunction(...args);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}
