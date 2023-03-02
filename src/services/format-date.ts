export const formatDate = (date: Date) =>
  date.toLocaleDateString('en-us', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
