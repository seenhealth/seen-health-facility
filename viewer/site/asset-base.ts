/// <reference types="vite/client" />
/**
 * Lets the facility viewer (app/page.tsx), which addresses its runtime files
 * root-relative ("/models/…", "/reference/…", "/brand/…"), run from any
 * folder of a static host without changing app code.
 *
 * URLs are rebased where they turn into requests rather than where they come
 * from, so page code, facility JSON (textures, GLB models) and specifications
 * opened from disk are all covered, and exported specifications keep their
 * portable root-relative paths:
 *
 * - `window.fetch`: facility JSON, and three.js FileLoader (`Request` objects)
 * - `HTMLImageElement#src`: three.js TextureLoader / ImageLoader
 * - `Element#setAttribute`: React's `src` / `href` (logo, download links)
 *
 * Patching the setters (not observing the DOM) rewrites before the browser
 * starts a request, so no stray 404 reaches the host root.
 */
const ASSET_DIRS = ['/models/', '/reference/', '/brand/'];

/** Folder that holds index.html, models/, reference/ and brand/. */
function assetRoot(): URL {
  const base = import.meta.env.BASE_URL;
  if (!base.startsWith('.')) return new URL(base, document.baseURI);
  // Relative base ('./'): resolve the way Vite resolves its own chunks, from
  // this module, which is emitted to assets/ one level below the root. Unlike
  // the document's URL, this survives hosts that inject a <base> or rewrite
  // the page's script URLs.
  try {
    const moduleUrl = import.meta.url;
    const dir = new URL('../', moduleUrl);
    if (dir.protocol === 'https:' || dir.protocol === 'http:') return dir;
  } catch {
    // Not a hierarchical module URL (blob:, data:); use the document's.
  }
  return new URL(base, document.baseURI);
}

const root = assetRoot();

/**
 * Maps a URL that resolves under a root-level asset folder of the page's
 * origin onto the asset root. With `link`, the site root ("/", the logo link)
 * maps to index.html's folder too. Everything else is returned unchanged.
 */
export function rebaseUrl(url: string, link = false): string {
  // Resolve as fetch() and <img> do: against the document's base URL.
  let doc: URL, u: URL;
  try {
    doc = new URL(document.baseURI);
    u = new URL(url, doc);
  } catch {
    return url;
  }
  if (u.origin !== doc.origin) return url;
  const asset = ASSET_DIRS.some((dir) => u.pathname.startsWith(dir));
  if (!asset && !(link && u.pathname === '/')) return url;
  const next = new URL(u.pathname.slice(1) + u.search + u.hash, root).href;
  return next === u.href ? url : next;
}

function install() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (input instanceof Request) {
      const url = rebaseUrl(input.url);
      return nativeFetch(
        url === input.url ? input : new Request(url, input),
        init,
      );
    }
    return nativeFetch(rebaseUrl(String(input)), init);
  };

  const src = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    'src',
  );
  if (src?.set)
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...src,
      set(this: HTMLImageElement, value: string) {
        src.set?.call(this, rebaseUrl(String(value)));
      },
    });

  const setAttribute = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'setAttribute',
  )?.value as Element['setAttribute'];
  // The cast drops the Workers HTMLRewriter overload that the project's types
  // merge into the DOM Element.
  Element.prototype.setAttribute = function (
    this: Element,
    name: string,
    value: string,
  ) {
    if (
      (name === 'src' || name === 'href') &&
      typeof value === 'string' &&
      value.startsWith('/') &&
      !value.startsWith('//')
    )
      value = rebaseUrl(
        value,
        name === 'href' && this instanceof HTMLAnchorElement,
      );
    setAttribute.call(this, name, value);
  } as Element['setAttribute'];
}

install();
