export default function MatchDetailLoading() {
  return (
    <div className="py-20 text-center">
      <div className="inline-block animate-spin h-7 w-7 border-3 border-indigo-600 border-t-transparent rounded-full mb-2" />
      <div className="text-xs text-slate-500">Loading match details...</div>
    </div>
  );
}
