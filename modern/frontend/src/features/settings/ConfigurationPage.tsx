import { mountConfiguration } from "./configuration";
import { useLegacyPage } from "./legacy";

/** Settings → Configuration (`#/settings/configuration/<section>`). */
export function ConfigurationPage({ section }: { section?: string }) {
  useLegacyPage((el) => {
    void mountConfiguration(el, section);
    return () => document.querySelectorAll(".cfg30-backdrop").forEach((n) => n.remove());
  }, [section]);
  return null;
}
