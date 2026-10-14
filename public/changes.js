export function changes(previous,next){
  const known=new Set((previous?.coupons||[]).filter(c=>c.status==='可领取').map(c=>c.title));
  const newCoupons=[...new Set((next.coupons||[]).filter(c=>c.status==='可领取'&&!known.has(c.title)).map(c=>c.title))];
  const before=previous?.offers?.[0]?.payableCents,after=next.offers?.[0]?.payableCents;
  const dropCents=Number.isSafeInteger(before)&&Number.isSafeInteger(after)&&after<before?before-after:0;
  return {newCoupons,dropCents};
}
