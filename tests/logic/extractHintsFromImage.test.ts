import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { extractHintsFromImageData } from '../../src/logic/extractHintsFromImage';
import { IMAGE_HINT_ANSWER_BY_FILE } from './answer';

describe('extractHintsFromImageData', () => {
  const sampleDirPath = join(__dirname, 'sample');

  it.each(Object.entries(IMAGE_HINT_ANSWER_BY_FILE))(
    'extracts hints from %s and matches answer data',
    (imageName, expected) => {
      const imagePath = join(sampleDirPath, imageName);
      const png = PNG.sync.read(readFileSync(imagePath));

      const extracted = extractHintsFromImageData({
        width: png.width,
        height: png.height,
        data: png.data,
      });

      expect(extracted.rowHintValues).toEqual(expected.rowHintValues);
      expect(extracted.colHintValues).toEqual(expected.colHintValues);
    },
  );
});
