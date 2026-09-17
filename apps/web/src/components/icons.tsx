import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </Icon>
);

export const IconFilm = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M3 15h18M9 4v16M15 4v16" />
  </Icon>
);

export const IconTv = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 18v3" />
  </Icon>
);

export const IconImage = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m4 18 5-5 4 4 3-3 4 4" />
  </Icon>
);

export const IconMusic = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Icon>
);

export const IconGamepad = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="2" y="8" width="20" height="10" rx="5" />
    <path d="M7 11v4M5 13h4M15.5 12.5h.01M18 14.5h.01" />
  </Icon>
);

export const IconFolder = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
  </Icon>
);

export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3v12m0 0-4-4m4 4 4-4" />
    <path d="M4 19h16" />
  </Icon>
);

export const IconActivity = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 12h4l2-7 4 14 2-7h6" />
  </Icon>
);

export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);

export const IconChevronsLeft = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />
  </Icon>
);

export const IconChevronsRight = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m13 17 5-5-5-5M6 17l5-5-5-5" />
  </Icon>
);

export const IconHardDrive = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="2" y="9" width="20" height="10" rx="2" />
    <path d="M2 13h20" />
    <path d="M6 17h.01M10 17h4" />
  </Icon>
);

export const IconGlobe = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 4 6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-6-4-9s1.5-6.5 4-9Z" />
  </Icon>
);

export const IconLogOut = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Icon>
);

export const IconScreenShare = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 21h8M12 16v5" />
    <path d="M9 12l3-3 3 3M12 9v5" />
  </Icon>
);

export const IconRemote = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="7" y="2" width="10" height="20" rx="4" />
    <circle cx="12" cy="7" r="1.5" />
    <path d="M9.5 12h5M9.5 16h5" />
  </Icon>
);
