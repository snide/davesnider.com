export const safeParams = <T>(value: any, validValues: T[], defaultValue: T): T => {
  if (validValues.includes(value)) {
    return value as T;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Invalid value: ${value}`);
};
