import { pipeline } from '@xenova/transformers';

const embed = async (text, model) => {
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
};

const cosineSimilarity = (a, b) => {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

async function main() {
  const model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const queryVec = await embed('authentication', model);
  const chunkVec = await embed('function login(username, password) { return true; }', model);
  console.log(Math.round(cosineSimilarity(queryVec, chunkVec) * 100));
}
main();
