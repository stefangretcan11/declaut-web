import type { ReleaseInfo } from "./license/types";

export const INSTALLER_DOWNLOAD_PATH = "/api/download";

type DownloadDependencies = {
  release(): Promise<ReleaseInfo>;
  repo: string | undefined;
  fetcher?: typeof fetch;
};

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function unavailable(head = false) {
  return new Response(head ? null : "Descărcarea nu este disponibilă momentan. Revino la pagina Descarcă și încearcă din nou.", {
    status: 503,
    headers: { ...responseHeaders, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "60" },
  });
}

function approvedSource(value: string | null, repo: string | undefined) {
  if (!value || !repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null;
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "github.com" && !url.port && !url.username && !url.password
    && url.pathname.startsWith(`/${repo}/releases/download/`) ? url : null;
}

export function createInstallerDownloadHandler({ release, repo, fetcher = fetch }: DownloadDependencies) {
  return async function download(request: Request): Promise<Response> {
    const head = request.method === "HEAD";
    const range = request.headers.get("range");
    if (range && (range.length > 128 || !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))) {
      return new Response(null, { status: 416, headers: responseHeaders });
    }

    try {
      const source = approvedSource((await release()).download_url, repo);
      if (!source) return unavailable(head);

      // Only these headers go upstream; visitor cookies and authorization stay local.
      const upstreamHeaders = new Headers({ Accept: "application/octet-stream", "Accept-Encoding": "identity", "User-Agent": "declaut-installer-download" });
      if (range) {
        upstreamHeaders.set("Range", range);
        const ifRange = request.headers.get("if-range");
        if (ifRange && ifRange.length <= 512) upstreamHeaders.set("If-Range", ifRange);
      }
      const upstream = await fetcher(source.href, {
        method: head ? "HEAD" : "GET",
        headers: upstreamHeaders,
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]),
      });

      if (upstream.status === 416) {
        await upstream.body?.cancel();
        const headers = new Headers(responseHeaders);
        const contentRange = upstream.headers.get("content-range");
        if (contentRange && /^bytes \*\/\d+$/.test(contentRange)) headers.set("Content-Range", contentRange);
        return new Response(null, { status: 416, headers });
      }
      const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (![200, 206].includes(upstream.status) || (!head && !upstream.body)
        || (contentType && !["application/octet-stream", "application/x-msdownload", "application/x-msdos-program", "application/vnd.microsoft.portable-executable"].includes(contentType))) {
        await upstream.body?.cancel();
        return unavailable(head);
      }

      // Do not forward Location, Link or other upstream headers that can reveal the repository.
      const headers = new Headers({
        ...responseHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="declaut-setup.exe"',
      });
      const length = upstream.headers.get("content-length");
      if (length && /^\d+$/.test(length)) headers.set("Content-Length", length);
      const contentRange = upstream.headers.get("content-range");
      if (upstream.status === 206 && contentRange && /^bytes \d+-\d+\/\d+$/.test(contentRange)) headers.set("Content-Range", contentRange);
      if (upstream.headers.get("accept-ranges") === "bytes") headers.set("Accept-Ranges", "bytes");
      for (const name of ["etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value && value.length <= 128 && !value.includes("://")) headers.set(name, value);
      }
      if (head) {
        await upstream.body?.cancel();
        return new Response(null, { status: upstream.status, headers });
      }
      // Pass the stream through without buffering the installer in function memory.
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch {
      return unavailable(head);
    }
  };
}
