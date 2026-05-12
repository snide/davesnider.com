export const safeParams = <T>(value: unknown, validValues: T[], defaultValue: T): T => {
  if (validValues.includes(value as T)) {
    return value as T;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Invalid value: ${value}`);
};
