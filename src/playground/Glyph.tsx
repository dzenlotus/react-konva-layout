const paths = {
  layout: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="18" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  code: (
    <>
      <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </>
  ),
  github: (
    <>
      <path d="M9 21v-4c-4 1-4-2-6-2m12 6v-4c0-1 .2-2-1-3 4 0 6-2 6-5 0-1-.4-2-1-3 0-1 0-2-.2-3-2 0-3 1-4 1-2-.5-4-.5-6 0C8 3 7 2 5 3c-.3 1-.3 2 0 3-1 1-1 2-1 3 0 3 2 5 6 5-1 1-1 2-1 3" />
    </>
  ),
  reset: (
    <>
      <path d="M3 10a9 9 0 1 1 1 8M3 3v7h7" />
    </>
  ),
};

export function Glyph({
  name,
  size = 18,
}: {
  name: 'layout' | 'code' | 'copy' | 'arrow' | 'github' | 'reset';
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
