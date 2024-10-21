export const sanitizeSearchTerm = (term: string): string => {
  return term.replace(/[^a-zA-Z0-9\s]/g, '');
};
