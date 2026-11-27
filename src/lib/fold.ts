/** Small letters with Turkish letters made plain (ş to s, ı to i…), so "sifre" finds "Şifre". Same as normalize_tr in the database. */
export function fold(text: string | null | undefined) {
  const from = 'İIıŞşĞğÜüÖöÇçÂâÎîÛû';
  const to = 'iiissgguuooccaaiiuu';
  let out = '';
  for (const letter of text ?? '') {
    const at = from.indexOf(letter);
    out += at >= 0 ? to[at] : letter;
  }
  return out.toLowerCase();
}
