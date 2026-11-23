import { pathToFileURL } from 'node:url';

/**
 * Converts a release tag such as v1.2.3 into an Android version name and
 * a monotonic integer version code.
 */
export function versionFromTag(tag) {
  if (typeof tag !== 'string') {
    throw new Error('Release tag is missing.');
  }
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) {
    throw new Error('Release tags must use the form vMAJOR.MINOR.PATCH.');
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (minor > 999 || patch > 999) {
    throw new Error('Minor and patch versions must be 999 or lower.');
  }
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (code > 2_100_000_000) {
    throw new Error('The derived Android version code is too large.');
  }
  return {
    name: `${major}.${minor}.${patch}`,
    code,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { name, code } = versionFromTag(process.argv[2] ?? '');
    console.log(`VERSION_NAME=${name}`);
    console.log(`VERSION_CODE=${code}`);
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
