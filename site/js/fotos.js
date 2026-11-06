// Carregar uma fotografia do computador (só editores, na versão online): reduz-se aqui no browser e passa a JPEG, o que lhe tira
// também os dados escondidos, como o lugar onde foi tirada. Só se envia ao gravar a ficha: uma fotografia escolhida e depois
// abandonada não chega ao repositório público (online/api/foto.js).
const LADO = 1400, MAXIMO = 1_100_000;
const QUALIDADES = [0.85, 0.75, 0.65, 0.55, 0.45];

let escolhida = null;

const paraBase64 = (blob) => new Promise((ok, falha) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = () => falha(new Error('Não consegui ler a fotografia.'));
  r.readAsDataURL(blob);
});

/** Prepara a fotografia para esta ficha e devolve um endereço temporário, para a mostrar antes de gravar. */
export async function prepararFoto(ficheiro, id) {
  let img;
  try { img = await createImageBitmap(ficheiro); } catch { throw new Error('Não consegui abrir esta fotografia. Use um ficheiro JPEG ou PNG.'); }
  const fator = Math.min(1, LADO / Math.max(img.width, img.height));
  const tela = document.createElement('canvas');
  tela.width = Math.round(img.width * fator); tela.height = Math.round(img.height * fator);
  const ctx = tela.getContext('2d');
  ctx.fillStyle = '#fff'; // um PNG transparente fica com fundo branco
  ctx.fillRect(0, 0, tela.width, tela.height);
  ctx.drawImage(img, 0, 0, tela.width, tela.height);
  img.close();
  for (const q of QUALIDADES) {
    const blob = await new Promise((ok) => tela.toBlob(ok, 'image/jpeg', q));
    const dados = await paraBase64(blob);
    if (dados.length <= MAXIMO) { escolhida = { id, dados }; return URL.createObjectURL(blob); }
  }
  throw new Error('A fotografia é demasiado grande.');
}

export const temFoto = (id) => escolhida?.id === id;
export const esquecerFoto = () => { escolhida = null; };

/** Envia a fotografia escolhida e devolve o endereço definitivo. */
export async function enviarFoto(id) {
  const r = await fetch('/api/foto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pessoa: id, dados: escolhida.dados }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.erro || 'Não foi possível guardar a fotografia. Tente daqui a pouco.');
  esquecerFoto();
  return j.url;
}
