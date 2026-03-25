export type HintValues = [string, string][];

export interface ImageHintAnswer {
  rowHintValues: HintValues;
  colHintValues: HintValues;
}

export const IMAGE_HINT_ANSWER_BY_FILE: Record<string, ImageHintAnswer> = {
  '1.png': {
    rowHintValues: [
      ['5', '1'],
      ['4', '2'],
      ['5', '1'],
      ['6', '1'],
      ['4', '1'],
    ],
    colHintValues: [
      ['7', '1'],
      ['4', '1'],
      ['5', '1'],
      ['4', '2'],
      ['4', '1'],
    ],
  },
  '2.png': {
    rowHintValues: [
      ['5', '2'],
      ['4', '1'],
      ['4', '2'],
      ['8', '0'],
      ['4', '1'],
    ],
    colHintValues: [
      ['7', '0'],
      ['3', '3'],
      ['5', '1'],
      ['5', '0'],
      ['5', '2'],
    ],
  },
  '3.png': {
    rowHintValues: [
      ['5', '1'],
      ['3', '2'],
      ['5', '1'],
      ['4', '1'],
      ['8', '1'],
    ],
    colHintValues: [
      ['5', '1'],
      ['3', '1'],
      ['5', '1'],
      ['4', '2'],
      ['8', '1'],
    ],
  },
  '4.png': {
    rowHintValues: [
      ['4', '2'],
      ['4', '1'],
      ['4', '2'],
      ['5', '1'],
      ['7', '0'],
    ],
    colHintValues: [
      ['8', '0'],
      ['4', '2'],
      ['4', '1'],
      ['7', '3'],
      ['5', '0'],
    ],
  },
  '5.png': {
    rowHintValues: [
      ['3', '1'],
      ['3', '2'],
      ['3', '2'],
      ['3', '1'],
      ['5', '1'],
    ],
    colHintValues: [
      ['2', '3'],
      ['5', '1'],
      ['5', '0'],
      ['7', '1'],
      ['5', '2'],
    ],
  },
  '6.png': {
    rowHintValues: [
      ['2', '3'],
      ['5', '0'],
      ['8', '1'],
      ['5', '1'],
      ['5', '1'],
    ],
    colHintValues: [
      ['5', '2'],
      ['3', '2'],
      ['6', '0'],
      ['5', '1'],
      ['6', '1'],
    ],
  },
};
