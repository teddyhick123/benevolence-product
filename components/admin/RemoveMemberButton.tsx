'use client';

type RemoveMemberButtonProps = {
  portfolioId: string;
  userId: string;
};

export default function RemoveMemberButton({ portfolioId, userId }: RemoveMemberButtonProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!confirm('Remove this member?')) {
      e.preventDefault();
    }
  };

  return (
    <form
      action={`/api/admin/portfolios/${encodeURIComponent(portfolioId)}/members/${encodeURIComponent(userId)}`}
      method="post"
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="_method" value="DELETE" />
      <button
        type="submit"
        className="px-3 py-1.5 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
      >
        Remove
      </button>
    </form>
  );
}
