import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { extractHintsFromImageData } from '../../src/logic/extractHintsFromImage';
import { IMAGE_HINT_ANSWER_BY_FILE } from './answer';

function countMatches(
  extracted: ReturnType<typeof extractHintsFromImageData>,
  expected: (typeof IMAGE_HINT_ANSWER_BY_FILE)[string],
): { matched: number; total: number } {
  let matched = 0;
  let total = 0;

  for (let i = 0; i < expected.rowHintValues.length; i++) {
    const expectedPair = expected.rowHintValues[i];
    const actualPair = extracted.rowHintValues[i] ?? ['', ''];
    if (actualPair[0] === expectedPair[0]) {
      matched += 1;
    }
    if (actualPair[1] === expectedPair[1]) {
      matched += 1;
    }
    total += 2;
  }

  for (let i = 0; i < expected.colHintValues.length; i++) {
    const expectedPair = expected.colHintValues[i];
    const actualPair = extracted.colHintValues[i] ?? ['', ''];
    if (actualPair[0] === expectedPair[0]) {
      matched += 1;
    }
    if (actualPair[1] === expectedPair[1]) {
      matched += 1;
    }
    total += 2;
  }

  return { matched, total };
}

describe('extractHintsFromImageData', () => {
  const sampleDirPath = join(__dirname, 'sample');

  it('extracts hints with at least 90% overall numeric similarity', () => {
    let matched = 0;
    let total = 0;

    for (const [imageName, expected] of Object.entries(
      IMAGE_HINT_ANSWER_BY_FILE,
    )) {
      const imagePath = join(sampleDirPath, imageName);
      const png = PNG.sync.read(readFileSync(imagePath));

      const extracted = extractHintsFromImageData({
        width: png.width,
        height: png.height,
        data: png.data,
      });

      const counts = countMatches(extracted, expected);
      matched += counts.matched;
      total += counts.total;
    }

    const similarity = total === 0 ? 0 : matched / total;
    expect(similarity).toBeGreaterThanOrEqual(0.9);
  });
});
