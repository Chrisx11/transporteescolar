// Gera os ícones PNG do PWA (sem dependências): fundo azul e um ônibus branco.
// Uso: node scripts/gerar-icones.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const AZUL = [0x17, 0x4f, 0xb0];
const BRANCO = [255, 255, 255];

const tabelaCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = tabelaCrc[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo, dados) {
  const t = Buffer.from(tipo);
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}

function dentroRet(x, y, x0, y0, x1, y1, r = 0) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Cor do pixel em coordenadas normalizadas (0..1). */
function pixel(u, v, { margem, cantos }) {
  if (cantos && !dentroRet(u, v, 0, 0, 1, 1, 0.18)) return null; // transparente
  // Ônibus ocupa a área útil (menor no ícone "maskable").
  const s = 1 - 2 * margem;
  const x = (u - margem) / s;
  const y = (v - margem) / s;
  const corpo = dentroRet(x, y, 0.2, 0.18, 0.8, 0.78, 0.08);
  const janela = dentroRet(x, y, 0.27, 0.27, 0.73, 0.5, 0.03);
  const farolE = dentroRet(x, y, 0.28, 0.62, 0.36, 0.69, 0.03);
  const farolD = dentroRet(x, y, 0.64, 0.62, 0.72, 0.69, 0.03);
  const rodaE = dentroRet(x, y, 0.26, 0.76, 0.38, 0.86, 0.03);
  const rodaD = dentroRet(x, y, 0.62, 0.76, 0.74, 0.86, 0.03);
  if ((corpo && !janela && !farolE && !farolD) || rodaE || rodaD) return BRANCO;
  return AZUL;
}

function png(tamanho, opcoes) {
  const linhas = [];
  for (let y = 0; y < tamanho; y++) {
    const linha = Buffer.alloc(1 + tamanho * 4);
    for (let x = 0; x < tamanho; x++) {
      const cor = pixel((x + 0.5) / tamanho, (y + 0.5) / tamanho, opcoes);
      const i = 1 + x * 4;
      if (cor) {
        linha[i] = cor[0];
        linha[i + 1] = cor[1];
        linha[i + 2] = cor[2];
        linha[i + 3] = 255;
      }
    }
    linhas.push(linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", deflateSync(Buffer.concat(linhas))),
    bloco("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icones", { recursive: true });
writeFileSync("public/icones/icone-192.png", png(192, { margem: 0.05, cantos: true }));
writeFileSync("public/icones/icone-512.png", png(512, { margem: 0.05, cantos: true }));
writeFileSync("public/icones/icone-180.png", png(180, { margem: 0.08, cantos: false }));
writeFileSync("public/icones/icone-maskable-512.png", png(512, { margem: 0.15, cantos: false }));
console.log("Ícones gerados em public/icones/");
