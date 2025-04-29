export function generateRowCandidates(
  sum: number,
  voltorb: number,
): number[][] {
  const results: number[][] = [];

  function backtrack(
    index: number,
    currentRow: number[],
    currentSum: number,
    currentVolt: number,
  ) {
    if (index === 5) {
      if (currentSum === sum && currentVolt === voltorb) {
        results.push([...currentRow]);
      }
      return;
    }

    for (const num of [0, 1, 2, 3]) {
      const nextSum = currentSum + (num > 0 ? num : 0);
      const nextVolt = currentVolt + (num === 0 ? 1 : 0);

      if (nextSum > sum || nextVolt > voltorb) continue;

      currentRow.push(num);
      backtrack(index + 1, currentRow, nextSum, nextVolt);
      currentRow.pop();
    }
  }

  backtrack(0, [], 0, 0);

  return results;
}
