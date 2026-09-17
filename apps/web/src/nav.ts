import type { ComponentType, SVGProps } from "react";
import {
  IconActivity,
  IconDownload,
  IconFilm,
  IconFolder,
  IconGamepad,
  IconGlobe,
  IconHardDrive,
  IconHome,
  IconImage,
  IconRemote,
  IconScreenShare,
  IconTv,
} from "./components/icons";

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Ordine di priorità visiva in Home, §17 */
  priority: number;
  searchable: boolean;
}

// Ordine sidebar (§16) e priorità Home (§17) sono intenzionalmente separati:
// la sidebar segue il flusso di navigazione, la Home la priorità dei contenuti.
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: IconHome, priority: 0, searchable: false },
  { to: "/film", label: "Film", icon: IconFilm, priority: 1, searchable: true },
  { to: "/serie", label: "Serie", icon: IconTv, priority: 2, searchable: true },
  { to: "/foto", label: "Foto", icon: IconImage, priority: 3, searchable: true },
  { to: "/giochi", label: "Giochi", icon: IconGamepad, priority: 4, searchable: true },
  { to: "/file", label: "File", icon: IconFolder, priority: 5, searchable: true },
  { to: "/download", label: "Download", icon: IconDownload, priority: 6, searchable: false },
  { to: "/storage", label: "Storage", icon: IconHardDrive, priority: 7, searchable: false },
  { to: "/web", label: "Web", icon: IconGlobe, priority: 8, searchable: false },
  { to: "/condivisione", label: "Condivisione schermo", icon: IconScreenShare, priority: 9, searchable: false },
  { to: "/telecomando", label: "Telecomando TV", icon: IconRemote, priority: 10, searchable: false },
  { to: "/sistema", label: "Sistema", icon: IconActivity, priority: 11, searchable: false },
];
