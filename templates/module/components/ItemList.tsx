'use client';

interface {ModuleName}Item {
  id: string;
  name: string;
}

interface Props {
  items: {ModuleName}Item[];
  onEdit: (id: string) => void;
}

/** Presentational only: the owning page receives data from the domain hook. */
export default function {ModuleName}ItemList({ items, onEdit }: Props) {
  if (items.length === 0) return <p>No items yet.</p>;

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between rounded-lg border p-4">
          <span>{item.name}</span>
          <button type="button" onClick={() => onEdit(item.id)}>
            Edit
          </button>
        </li>
      ))}
    </ul>
  );
}
