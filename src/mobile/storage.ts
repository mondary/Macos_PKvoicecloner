import { defaults, type Book, type Settings } from './types';
const opened = new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open('pk-reader', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('books', { keyPath: 'id' });
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await opened;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('books', mode);
    const req = action(tx.objectStore('books'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Stockage interrompu'));
  });
}
export const library = {
  all: () => transaction('readonly', s => s.getAll()) as Promise<Book[]>,
  save: (book: Book) => transaction('readwrite', s => s.put(book)),
  remove: (id: string) => transaction('readwrite', s => s.delete(id)),
};
export function readSettings(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('pk-reader-settings') ?? '{}') }; }
  catch { return { ...defaults }; }
}
export function saveSettings(settings: Settings) { localStorage.setItem('pk-reader-settings', JSON.stringify(settings)); }
