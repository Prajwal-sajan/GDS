import { useLegacyPage } from "./legacy";
import { closeTeamAccessOverlays, mountTeamAccess } from "./teamAccess";

/** Settings → Team & access (`#/settings/team-access/<tab>/...`), legacy v26/v28/v29 layers. */
export function TeamAccessPage({ parts }: { parts: string[] }) {
  useLegacyPage((el) => {
    void mountTeamAccess(el, parts);
    return closeTeamAccessOverlays;
  }, [parts.join("/")]);
  return null;
}
