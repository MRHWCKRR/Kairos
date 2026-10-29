import {createHash} from 'node:crypto';
import path from 'node:path';

// One digest for the public release also handles cycles: every importer of a
// singleton module receives the same URL, including lazy and inline imports.
export function versionPublicAssets(input) {
    const rewrite = (name, source, version) => source.replace(
        /(["'`])((?:\.{0,2}\/)?[a-zA-Z0-9_./-]+\.(?:js|css))([?#][^"'`\s<>]*)?\1/g,
        (match, quote, file, suffix = '', offset) => {
            const target = path.posix.normalize(file.startsWith('/') ? file.slice(1) : path.posix.join(path.posix.dirname(name), file));
            if (!input.has(target)) return match;
            const escaped = suffix.includes('&amp;') || name.endsWith('.html') && /<[A-Za-z][^<>]*\b(?:src|href)\s*=\s*$/.test(source.slice(0, offset));
            const url = new URL(file + suffix.replaceAll('&amp;', '&'), 'https://assets.invalid/');
            url.searchParams.delete('v');
            if (version) url.searchParams.set('v', version);
            const query = url.search ? (escaped ? url.search.replaceAll('&', '&amp;') : url.search) : '';
            return quote + file + query + url.hash + quote;
        }
    );
    const normalized = [...input].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([name, source]) => [name, rewrite(name, source, null)]);
    const version = createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
    return {version, files:new Map(normalized.map(([name, source]) => [name, rewrite(name, source, version)]))};
}
