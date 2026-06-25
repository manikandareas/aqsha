export function encodePaperRef(key: string) {
  return encodeURIComponent(key);
}

export function decodePaperRef(paperRef: string) {
  return decodeURIComponent(paperRef);
}
