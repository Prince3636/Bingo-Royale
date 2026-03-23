
export const generateBingoBoard = (): number[][] => {
  const nums = Array.from({ length: 25 }, (_, i) => i + 1);
  // Shuffle
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }

  const board: number[][] = [];
  for (let i = 0; i < 5; i++) {
    board.push(nums.slice(i * 5, (i + 1) * 5));
  }

  return board;
};

export const checkBingo = (marked: boolean[][]): number => {
  let lines = 0;

  // Rows
  for (let r = 0; r < 5; r++) {
    if (marked[r].every(cell => cell)) lines++;
  }

  // Columns
  for (let c = 0; c < 5; c++) {
    let colFull = true;
    for (let r = 0; r < 5; r++) {
      if (!marked[r][c]) {
        colFull = false;
        break;
      }
    }
    if (colFull) lines++;
  }

  // Diagonals
  let diag1 = true;
  let diag2 = true;
  for (let i = 0; i < 5; i++) {
    if (!marked[i][i]) diag1 = false;
    if (!marked[i][4 - i]) diag2 = false;
  }
  if (diag1) lines++;
  if (diag2) lines++;

  return lines;
};
