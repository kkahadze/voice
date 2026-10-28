// Import each curriculum ID once. Existing progress and intentional deletions win.
export function mergeCurriculum(existing, importedIds, curriculum) {
  const ids = new Set(existing.map(card => card.id));
  const seen = new Set(importedIds);
  const additions = curriculum.filter(card => !ids.has(card.id) && !seen.has(card.id));
  return { cards: [...existing, ...additions.map(card => ({ ...card }))], importedIds: [...new Set([...seen, ...curriculum.map(card => card.id)])], added: additions.length };
}
