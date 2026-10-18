export function TableHead({ columns }) {
  return <thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>;
}
