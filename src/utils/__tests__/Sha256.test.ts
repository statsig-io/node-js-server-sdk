import shajs from 'sha.js';

import { Base64 } from '../Base64';
import { SHA256 } from '../Sha256';

function getExpectedHash(value: string) {
  const buffer = shajs('sha256').update(value).digest();
  return Base64.encodeArrayBuffer(buffer);
}

function getActualHash(value: string) {
  const buffer = SHA256(value);
  return Base64.encodeArrayBuffer(buffer.arrayBuffer());
}

function generateRandomWordFromArray(inputArray: string[]) {
  if (inputArray.length < 3) {
    throw new Error('Array must have at least 3 elements');
  }

  const randomIndices: number[] = [];
  while (randomIndices.length < 3) {
    const randomIndex = Math.floor(Math.random() * inputArray.length);
    if (!randomIndices.includes(randomIndex)) {
      randomIndices.push(randomIndex);
    }
  }

  const randomWords = randomIndices.map((index) => inputArray[index]);
  const randomWord = randomWords.join('_');

  return randomWord;
}

function generateTestCases(count: number) {
  const words = [
    'apple',
    'banana',
    'orange',
    'grape',
    'kiwi',
    'strawberry',
    'melon',
    'carrot',
    'potato',
    'broccoli',
    'pepper',
    'tomato',
    'cucumber',
    'lettuce',
    'dog',
    'cat',
    'bird',
    'fish',
    'rabbit',
    'hamster',
    'turtle',
    'horse',
    '大',
    'بزرگ',
    '123',
    '980$@',
  ];

  const randomWords: string[] = [];

  for (let i = 0; i < count; i++) {
    const word = generateRandomWordFromArray(words);
    randomWords.push(word);
  }

  return randomWords;
}

const ITERATIONS = 5000;

describe('Sha256 Results', () => {
  test.each(generateTestCases(10))('%s', (word) => {
    expect.assertions(ITERATIONS);

    for (let i = 0; i < ITERATIONS; i++) {
      const expected = getExpectedHash(word);
      const actual = getActualHash(word);
      expect(actual).toEqual(expected);
    }
  });
});
