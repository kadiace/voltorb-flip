export type HintValuePair = [string, string];

export interface ExtractedHintValues {
  rowHintValues: HintValuePair[];
  colHintValues: HintValuePair[];
}

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

function createEmptyHintValues(): ExtractedHintValues {
  return {
    rowHintValues: Array.from({ length: 5 }, (): HintValuePair => ['0', '0']),
    colHintValues: Array.from({ length: 5 }, (): HintValuePair => ['0', '0']),
  };
}

export function extractHintsFromImageData(
  image: ImageDataLike,
): ExtractedHintValues {
  console.log(
    `[extractHintsFromImageData] received image: ${image.width}x${image.height}`,
  );
  return createEmptyHintValues();
}

export async function extractHintsFromImageBitmap(
  blob: Blob,
): Promise<ExtractedHintValues> {
  console.log(
    `[extractHintsFromImageBitmap] received blob size: ${blob.size} bytes`,
  );
  return createEmptyHintValues();
}
