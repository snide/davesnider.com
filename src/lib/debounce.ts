export const debounce = (func: (...args: any[]) => void, wait: number): ((...args: any[]) => void) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: any[]): void => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
