export default function asyncify<T>(
  syncFunction: (...args: any[]) => T,
  ...args: any[]
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
