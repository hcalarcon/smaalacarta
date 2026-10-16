const storageKey = (slug) => `smaalacarta:cart:${encodeURIComponent(slug)}`;

export function loadCart(storage, slug) {
  const saved = storage.getItem(storageKey(slug));
  return saved ? JSON.parse(saved) : [];
}

export function saveCart(storage, slug, cart) {
  storage.setItem(storageKey(slug), JSON.stringify(cart));
}
