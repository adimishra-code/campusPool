// Escape user-supplied text before using it in a MongoDB $regex query.
// Without this, metacharacters in the input become a live regex — both a
// correctness bug (e.g. "a.b" matching "axb") and a ReDoS vector (e.g.
// "(a+)+$" causing catastrophic backtracking). We escape every special char
// and cap length so the value is treated as a literal substring.
export function escapeRegex(input = "", maxLen = 100) {
  return String(input)
    .slice(0, maxLen)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default escapeRegex;
