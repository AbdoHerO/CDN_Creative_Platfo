import type { Readable } from "node:stream";
import yauzl from "yauzl";

/** Promise wrappers around yauzl (random-access ZIP reader with size validation). */

export type ZipEntry = yauzl.Entry & { fileName: Buffer | string };

export function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    // decodeStrings:false → we validate names ourselves so one bad entry does
    // not abort the whole archive; validateEntrySizes guards against bombs that
    // lie about their uncompressed size.
    yauzl.open(path, { lazyEntries: true, autoClose: false, decodeStrings: false, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error("Could not open archive"));
      else resolve(zip);
    });
  });
}

export async function* iterateEntries(zip: yauzl.ZipFile): AsyncGenerator<ZipEntry> {
  const queue: ZipEntry[] = [];
  let done = false;
  let error: Error | null = null;
  let wake: (() => void) | null = null;
  const onEntry = (e: ZipEntry) => {
    queue.push(e);
    wake?.();
  };
  const onEnd = () => {
    done = true;
    wake?.();
  };
  const onError = (e: Error) => {
    error = e;
    wake?.();
  };
  zip.on("entry", onEntry);
  zip.on("end", onEnd);
  zip.on("error", onError);
  try {
    zip.readEntry();
    for (;;) {
      if (error) throw error;
      const next = queue.shift();
      if (next) {
        yield next;
        zip.readEntry();
        continue;
      }
      if (done) return;
      await new Promise<void>((r) => (wake = r));
      wake = null;
    }
  } finally {
    zip.off("entry", onEntry);
    zip.off("end", onEnd);
    zip.off("error", onError);
  }
}

export function openEntryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) reject(err ?? new Error("Could not read entry"));
      else resolve(stream);
    });
  });
}

/** Read up to `bytes` from the start of an entry (for magic-number sniffing). */
export async function readEntryHead(zip: yauzl.ZipFile, entry: yauzl.Entry, bytes = 4100): Promise<Buffer> {
  const stream = await openEntryStream(zip, entry);
  const chunks: Buffer[] = [];
  let total = 0;
  return new Promise((resolve, reject) => {
    const finish = () => {
      stream.removeAllListeners("data");
      stream.destroy();
      resolve(Buffer.concat(chunks).subarray(0, bytes));
    };
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= bytes) finish();
    });
    stream.on("end", finish);
    stream.on("error", (e) => (total >= bytes ? resolve(Buffer.concat(chunks).subarray(0, bytes)) : reject(e)));
  });
}
