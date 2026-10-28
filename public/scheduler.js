export const stages = [
  { name: 'Unlearned', days: 0, label: 'Ready to start' },
  { name: 'Learning', days: 1, label: '1-day interval' },
  { name: 'Building', days: 3, label: '3-day interval' },
  { name: 'Confident', days: 7, label: '7-day interval' },
  { name: 'Long-term', days: 30, label: '30-day interval' }
];
export function moveCard(card, stage, now = Date.now()) {
  if (!Number.isInteger(stage) || !stages[stage]) throw new Error('Invalid stage');
  return { ...card, stage, due: now + stages[stage].days * 86400000 };
}
export function reviewCard(card, remembered, now = Date.now()) {
  const next = moveCard(card, remembered ? Math.min(4, card.stage + 1) : 1, now);
  if (!remembered) next.due = now + 600000;
  return { ...next, reviews: (card.reviews || 0) + 1, lastReview: now };
}
