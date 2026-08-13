/**
 * Fallback GLB 3D Generator
 * Creates a valid binary glTF 2.0 (.glb) model in memory.
 * Used when external Hugging Face AI spaces are completely unreachable or rate-limited.
 */

export function generateFallbackGlbBuffer(): Buffer {
  // 3D octahedron / crystal mesh data
  const positions = new Float32Array([
    // Top pyramid
     0.0,  1.0,  0.0,   0.8,  0.0,  0.8,   0.8,  0.0, -0.8,
     0.0,  1.0,  0.0,   0.8,  0.0, -0.8,  -0.8,  0.0, -0.8,
     0.0,  1.0,  0.0,  -0.8,  0.0, -0.8,  -0.8,  0.0,  0.8,
     0.0,  1.0,  0.0,  -0.8,  0.0,  0.8,   0.8,  0.0,  0.8,
    // Bottom pyramid
     0.0, -1.0,  0.0,   0.8,  0.0, -0.8,   0.8,  0.0,  0.8,
     0.0, -1.0,  0.0,  -0.8,  0.0, -0.8,   0.8,  0.0, -0.8,
     0.0, -1.0,  0.0,  -0.8,  0.0,  0.8,  -0.8,  0.0, -0.8,
     0.0, -1.0,  0.0,   0.8,  0.0,  0.8,  -0.8,  0.0,  0.8,
  ]);

  const normals = new Float32Array([
    // Top normals
     0.5, 0.7, 0.5,   0.5, 0.7, 0.5,   0.5, 0.7, 0.5,
     0.5, 0.7,-0.5,   0.5, 0.7,-0.5,   0.5, 0.7,-0.5,
    -0.5, 0.7,-0.5,  -0.5, 0.7,-0.5,  -0.5, 0.7,-0.5,
    -0.5, 0.7, 0.5,  -0.5, 0.7, 0.5,  -0.5, 0.7, 0.5,
    // Bottom normals
     0.5,-0.7, 0.5,   0.5,-0.7, 0.5,   0.5,-0.7, 0.5,
     0.5,-0.7,-0.5,   0.5,-0.7,-0.5,   0.5,-0.7,-0.5,
    -0.5,-0.7,-0.5,  -0.5,-0.7,-0.5,  -0.5,-0.7,-0.5,
    -0.5,-0.7, 0.5,  -0.5,-0.7, 0.5,  -0.5,-0.7, 0.5,
  ]);

  const indices = new Uint16Array([
    0, 1, 2,   3, 4, 5,   6, 7, 8,   9, 10, 11,
    12, 13, 14,  15, 16, 17,  18, 19, 20,  21, 22, 23
  ]);

  const posBuffer = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  const normBuffer = Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength);
  const idxBuffer = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength);

  // Align buffer to 4-byte boundaries
  const binLength = posBuffer.length + normBuffer.length + idxBuffer.length;
  const binPadding = (4 - (binLength % 4)) % 4;
  const totalBinLength = binLength + binPadding;

  const binData = Buffer.concat([posBuffer, normBuffer, idxBuffer, Buffer.alloc(binPadding)]);

  const gltfJson = {
    asset: { version: "2.0", generator: "3DGen-AI-Engine" },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Fallback_3D_Mesh" }],
    meshes: [
      {
        name: "Crystal_Mesh",
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: "Emerald_Metallic_PBR",
        pbrMetallicRoughness: {
          baseColorFactor: [0.1, 0.85, 0.65, 1.0],
          metallicFactor: 0.8,
          roughnessFactor: 0.2,
        },
      },
    ],
    buffers: [{ byteLength: totalBinLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: posBuffer.length, byteLength: normBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: posBuffer.length + normBuffer.length, byteLength: idxBuffer.length, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 24,
        type: "VEC3",
        max: [0.8, 1.0, 0.8],
        min: [-0.8, -1.0, -0.8],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 24,
        type: "VEC3",
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: 24,
        type: "SCALAR",
      },
    ],
  };

  const jsonString = JSON.stringify(gltfJson);
  const jsonBuffer = Buffer.from(jsonString, "utf8");
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const totalJsonLength = jsonBuffer.length + jsonPadding;
  const paddedJsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]); // space padded

  // Header: 12 bytes
  // Chunk 0 header: 8 bytes (JSON)
  // Chunk 1 header: 8 bytes (BIN)
  const totalFileLength = 12 + 8 + totalJsonLength + 8 + totalBinLength;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // Magic: "glTF"
  header.writeUInt32LE(2, 4);          // Version 2
  header.writeUInt32LE(totalFileLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(totalJsonLength, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // Chunk type: JSON ("JSON" in LE uint32)

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(totalBinLength, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4); // Chunk type: BIN ("BIN\0" in LE uint32)

  return Buffer.concat([header, jsonChunkHeader, paddedJsonBuffer, binChunkHeader, binData]);
}
